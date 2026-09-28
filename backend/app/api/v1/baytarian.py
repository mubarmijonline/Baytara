import os

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from datetime import date, datetime, timezone

from ...extensions import db
from ...models import BaytarianRequest, User, push_notification

bp = Blueprint("baytarian", __name__)

ALLOWED = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_DOCS = 5


def _uid():
    return int(get_jwt_identity())


@bp.get("/baytarian/me")
@jwt_required()
def my_status():
    """Current user's Baytarian state + latest request."""
    user = db.session.get(User, _uid())
    latest = (BaytarianRequest.query.filter_by(user_id=_uid())
              .order_by(BaytarianRequest.created_at.desc()).first())
    return jsonify(is_baytarian=user.is_baytarian, is_vet_student=user.is_vet_student,
                   request=latest.to_dict() if latest else None)


@bp.post("/baytarian/request")
@jwt_required()
def submit_request():
    """Upload verification documents (PDF/images) to request Baytarian status."""
    user = db.session.get(User, _uid())
    if user.is_baytarian:
        return jsonify(error="already_verified"), 409
    if BaytarianRequest.query.filter_by(user_id=_uid(), status="pending").first():
        return jsonify(error="request_pending"), 409

    files = request.files.getlist("documents")
    files = [f for f in files if f and f.filename]
    if not files:
        return jsonify(error="documents_required"), 400
    if len(files) > MAX_DOCS:
        return jsonify(error="too_many_documents", max=MAX_DOCS), 400
    for f in files:
        if f.mimetype not in ALLOWED:
            return jsonify(error="unsupported_media_type", allowed=sorted(ALLOWED)), 415

    folder = os.path.join(current_app.config["BAYTARIAN_DOC_DIR"], str(_uid()))
    os.makedirs(folder, exist_ok=True)
    saved = []
    for i, f in enumerate(files):
        name = f"{i}_{secure_filename(f.filename)}"
        path = os.path.join(folder, name)
        f.save(path)
        saved.append(path)

    req = BaytarianRequest(user_id=_uid(), status="pending",
                           documents=saved, note=(request.form.get("note") or "")[:500])
    db.session.add(req)
    db.session.commit()
    return jsonify(request=req.to_dict()), 201


# ------------------------- card verification (self-service) -------------------------

CARD_TYPES = {"image/jpeg", "image/png", "image/webp"}
CARD_MAX_BYTES = 8 * 1024 * 1024
# One in every N auto-approvals is marked for a human to look at afterwards. Taken from
# the request id so it is deterministic — no randomness to make a test flaky.
SPOT_CHECK_EVERY = 5


def _read_card(files):
    """OCR both sides. Returns (back_text, front_text) or (None, error)."""
    from ...services.instapay_ocr import extract_text

    texts = {}
    for side, storage in files.items():
        try:
            texts[side] = extract_text(storage)
        except Exception:  # noqa: BLE001 — a Vision outage must not 500 the form
            current_app.logger.exception("vision failed reading card side %s", side)
            return None, "ocr_unavailable"
    return texts, None


def _save_sides(uid, files):
    folder = os.path.join(current_app.config["BAYTARIAN_DOC_DIR"], str(uid), "card")
    os.makedirs(folder, exist_ok=True)
    saved = {}
    for side, storage in files.items():
        storage.stream.seek(0)
        path = os.path.join(folder, f"{side}_{secure_filename(storage.filename)}")
        storage.save(path)
        saved[side] = path
    return saved


def _collect_sides():
    """Validate the two uploads. Returns (files, None) or (None, (body, status))."""
    files = {}
    for side in ("front", "back"):
        storage = request.files.get(side)
        if not storage or not storage.filename:
            return None, (jsonify(error="both_sides_required"), 400)
        if storage.mimetype not in CARD_TYPES:
            return None, (jsonify(error="unsupported_media_type", allowed=sorted(CARD_TYPES)), 415)
        storage.stream.seek(0, os.SEEK_END)
        if storage.stream.tell() > CARD_MAX_BYTES:
            return None, (jsonify(error="file_too_large", max_bytes=CARD_MAX_BYTES), 413)
        storage.stream.seek(0)
        files[side] = storage
    return files, None


def _log_rejection(user, texts, report):
    """What Vision returned, whenever a card does not check out. Without it a failure
    in the wild is unreproducible and diagnosing it becomes guesswork."""
    failed = [k for k, f in report["fields"].items()
              if k != "national_id_decoded" and not f["ok"]]
    current_app.logger.warning(
        "card rejected for user %s, failed=%s problems=%s\n--- front (details) ---\n%s\n--- back ---\n%s",
        user.id, failed, report.get("problems"),
        (texts.get("front") or "")[:700], (texts.get("back") or "")[:700])


def _check_card(user, texts, today=None):
    """Every rule, in one place, so preview and submit can never disagree."""
    from ...services.vet_card import governorate_agrees, parse_card

    report = parse_card(texts.get("front", ""), texts.get("back", ""), today=today)
    fields = report["fields"]
    problems = []

    # A national ID typed on the profile is optional (client, 2026-09-28: applicants from
    # other Arab countries have no Egyptian number to type, and the card is proof enough).
    # When there is one, the card must carry it. When there is not, the number printed on
    # the card must not already belong to another account, and submit records it, which
    # is the same rule the document route applies.
    card_id = fields["national_id"]["value"] if fields["national_id"]["ok"] else None
    if user.national_id:
        if card_id and card_id != user.national_id:
            # The card belongs to somebody, but not to whoever is holding this account.
            fields["national_id"]["ok"] = False
            fields["national_id"]["problem"] = "does_not_match_profile"
    elif card_id and User.query.filter(User.national_id == card_id, User.id != user.id).first():
        fields["national_id"]["ok"] = False
        fields["national_id"]["problem"] = "card_already_used"

    decoded = fields.get("national_id_decoded")
    printed = fields["governorate"]["value"]
    if decoded and printed and not governorate_agrees(decoded, printed):
        fields["governorate"]["ok"] = False
        fields["governorate"]["problem"] = "does_not_match_national_id"

    # One card, one account. Checked against verified accounts only, so an abandoned
    # half-finished attempt never blocks the real owner.
    # Only compare numbers we actually read. Passing a None built "vet_registration_no
    # IS NULL" into the OR, which matched every verified account that has no card on
    # file and reported a fresh card as already used.
    claims = [column == fields[key]["value"]
              for key, column in (("registration_no", User.vet_registration_no),
                                  ("license_no", User.vet_license_no))
              if fields[key]["ok"] and fields[key]["value"]]
    taken = User.query.filter(
        User.id != user.id, User.is_baytarian.is_(True), db.or_(*claims),
    ).first() if claims else None
    if taken:
        fields["registration_no"]["ok"] = False
        fields["registration_no"]["problem"] = "card_already_used"

    checked = [key for key in fields if key != "national_id_decoded"]
    report["complete"] = all(fields[key]["ok"] for key in checked) and not problems
    report["problems"] = problems
    return report


@bp.post("/baytarian/card/preview")
@jwt_required()
def preview_card():
    """Read the card and report every field without saving anything.

    The learner sees exactly what the machine read before committing to it — no
    request row, no approval, no files kept.
    """
    user = db.session.get(User, _uid())
    if user.is_baytarian:
        return jsonify(error="already_verified"), 409
    files, failure = _collect_sides()
    if failure:
        return failure
    texts, error = _read_card(files)
    if error:
        return jsonify(error=error), 503
    report = _check_card(user, texts)
    if not report["complete"]:
        _log_rejection(user, texts, report)
    return jsonify(report=report)


@bp.post("/baytarian/card")
@jwt_required()
def submit_card():
    """Verify from the card. Approved by the system when every rule passes.

    The client's own checks are a courtesy; every rule is re-run here.
    """
    user = db.session.get(User, _uid())
    if user.is_baytarian:
        return jsonify(error="already_verified"), 409
    if BaytarianRequest.query.filter_by(user_id=_uid(), status="pending").first():
        return jsonify(error="request_pending"), 409
    files, failure = _collect_sides()
    if failure:
        return failure
    texts, error = _read_card(files)
    if error:
        return jsonify(error=error), 503

    report = _check_card(user, texts)
    if not report["complete"]:
        # Nothing is written, but the text is logged: without it a failure in the wild
        # is unreproducible, and guessing at OCR output wastes a day.
        _log_rejection(user, texts, report)
        return jsonify(error="card_not_verified", report=report), 422

    saved = _save_sides(_uid(), files)
    fields = report["fields"]
    req = BaytarianRequest(
        user_id=_uid(), status="approved", auto_approved=True,
        route="syndicate_card", grant="baytarian",
        card_front=saved["front"], card_back=saved["back"],
        ocr_text=f"--- front (details) ---\n{texts.get('front', '')}\n--- back ---\n{texts.get('back', '')}",
        parsed=report, documents=[saved["front"], saved["back"]],
        reviewed_at=datetime.now(timezone.utc),   # reviewed_by stays null: the system did it
    )
    db.session.add(req)
    db.session.flush()
    req.spot_check = req.id % SPOT_CHECK_EVERY == 0

    user.is_baytarian = True
    if not user.national_id:
        # Write-once, as on the profile: it is now what stops this card verifying a
        # second account.
        user.national_id = fields["national_id"]["value"]
    user.vet_registration_no = fields["registration_no"]["value"]
    user.vet_license_no = fields["license_no"]["value"]
    user.vet_governorate = fields["governorate"]["value"]
    user.vet_card_expires_at = date.fromisoformat(fields["expires_at"]["value"])
    push_notification(_uid(), "baytarian_approved", "تم توثيق حسابك كطبيب بيطري ✅",
                      "تم التحقق من بطاقة النقابة تلقائياً. أصبح بإمكانك الوصول إلى محتوى الأطباء الموثّقين.")
    db.session.commit()
    return jsonify(request=req.to_dict(), is_baytarian=True), 201


# ---------------------- other documents, judged by a model ----------------------
#
# The syndicate card has one layout and is parsed by hand. A national ID card or a
# veterinary college ID does not: there is no stable pattern to write, so the reading
# is done by a model and the decision is made from what it reports. Whatever it cannot
# settle becomes an ordinary pending request with the reading attached, which is the
# same queue an admin already works.

DOC_ROUTES = {"national_id", "other"}

# There is one verified status — بيطريّ موثّق — and both grants confer it. What differs
# is the kind recorded against it: a student or a licensed doctor. They reach the same
# content; the distinction is there so the platform knows who it is talking to.
GRANT_COPY = {
    "baytarian": ("baytarian_approved", "تم توثيق حسابك كطبيب بيطري ✅",
                  "قرأنا المستند وتم توثيقك تلقائياً. أصبح بإمكانك الوصول إلى محتوى الأطباء الموثّقين."),
    "vet_student": ("baytarian_approved", "تم توثيق حسابك كطالب طب بيطري ✅",
                    "قرأنا المستند وتم توثيقك تلقائياً. أصبح بإمكانك الوصول إلى محتوى الأطباء الموثّقين."),
}


def _grant_status(user, grant):
    """Apply a grant. Both kinds verify the account; only the marker differs."""
    user.is_baytarian = True
    user.is_vet_student = grant == "vet_student"


def _tell_admins(type_, title, body):
    """Every auto-approval an admin should look at lands in their notifications. A
    machine deciding on its own is only acceptable while a person can still see it."""
    for admin_id, in db.session.query(User.id).filter(
            User.role == "admin", User.is_active.is_(True)).all():
        push_notification(admin_id, type_, title, body)


def _collect_document():
    """One or two images. Unlike the syndicate card, a college ID may only have one
    side worth photographing, so the back is optional."""
    images = []
    for side in ("front", "back"):
        storage = request.files.get(side)
        if not storage or not storage.filename:
            continue
        if storage.mimetype not in CARD_TYPES:
            return None, (jsonify(error="unsupported_media_type", allowed=sorted(CARD_TYPES)), 415)
        storage.stream.seek(0, os.SEEK_END)
        if storage.stream.tell() > CARD_MAX_BYTES:
            return None, (jsonify(error="file_too_large", max_bytes=CARD_MAX_BYTES), 413)
        storage.stream.seek(0)
        images.append((side, storage))
    if not images:
        return None, (jsonify(error="document_required"), 400)
    return images, None


@bp.post("/baytarian/document")
@jwt_required()
def submit_document():
    """Verify from a national ID or any other document a model can read.

    `route=national_id` — the occupation printed on the card must read طبيب بيطري.
    `route=other`       — a college ID, an enrolment letter, anything: the model says
                          what it is and the answer decides between the veterinarian
                          status, the student status, and a human.
    """
    from ...services import doc_judge

    user = db.session.get(User, _uid())
    route = (request.form.get("route") or "other").strip()
    if route not in DOC_ROUTES:
        return jsonify(error="invalid_route", allowed=sorted(DOC_ROUTES)), 400
    if user.is_baytarian:
        return jsonify(error="already_verified"), 409
    if BaytarianRequest.query.filter_by(user_id=_uid(), status="pending").first():
        return jsonify(error="request_pending"), 409

    files, failure = _collect_document()
    if failure:
        return failure

    images = []
    for _, storage in files:
        storage.stream.seek(0)
        images.append((storage.read(), storage.mimetype))

    expect = {"name": user.name, "national_id": user.national_id}
    try:
        verdict = doc_judge.judge(images, expect)
    except Exception:  # noqa: BLE001 — an outage sends it to a human, it does not 500
        current_app.logger.exception("document judge failed for user %s", user.id)
        verdict = None

    grant, problem = doc_judge.decide(verdict, route, expect)

    # One document, one account. `decide` catches a card whose number disagrees with the
    # profile, but says nothing when the profile is empty — and that was every applicant
    # coming through this door, so the same national ID could have verified any number of
    # accounts. The number read off the document is checked against every other account
    # and then written to this one, which both closes that and fills in the profile.
    claimed = ((verdict or {}).get("national_id") or "").strip()
    if grant and claimed:
        from ...services.vet_card import parse_national_id

        decoded, _ = parse_national_id(claimed)
        claimed = decoded["national_id"] if decoded else ""
        if claimed and User.query.filter(User.national_id == claimed,
                                         User.id != user.id).first():
            grant, problem = None, "card_already_used"

    if problem:
        # A definite no. Nothing is stored: they can retake the photo or come through
        # another door, and a queue full of definite noes helps nobody.
        current_app.logger.info("document rejected for user %s route=%s problem=%s",
                                user.id, route, problem)
        return jsonify(error=problem, verdict=verdict), 422

    saved = _save_sides(_uid(), dict(files))
    paths = [saved[side] for side, _ in files]
    req = BaytarianRequest(
        user_id=_uid(), route=route, ai_verdict=verdict, documents=paths,
        card_front=paths[0], card_back=paths[1] if len(paths) > 1 else None,
        note=(verdict or {}).get("reason", "")[:500],
    )

    if not grant:
        # Nobody could tell — including when there is no key configured and `verdict`
        # is None. It becomes an ordinary pending request, which is what the manual
        # flow has always been.
        req.status = "pending"
        db.session.add(req)
        db.session.commit()
        return jsonify(request=req.to_dict(), pending=True), 202

    req.status = "approved"
    req.auto_approved = True
    req.grant = grant
    req.reviewed_at = datetime.now(timezone.utc)   # reviewed_by stays null: the system did it
    db.session.add(req)
    db.session.flush()
    req.spot_check = req.id % SPOT_CHECK_EVERY == 0

    _grant_status(user, grant)
    if claimed and not user.national_id:
        # Write-once, same as the profile field: it is now the account's identity, and
        # what stops this document verifying a second account.
        user.national_id = claimed

    type_, title, body = GRANT_COPY[grant]
    push_notification(_uid(), type_, title, body)
    _tell_admins(
        "baytarian_auto_approved",
        "توثيق تلقائي يحتاج مراجعة",
        f"تم توثيق {user.name} ({'طبيب بيطري' if grant == 'baytarian' else 'طالب'}) "
        f"تلقائياً من مستند. يمكنك مراجعة الطلب رقم {req.id} أو سحب التوثيق.",
    )
    db.session.commit()
    return jsonify(request=req.to_dict(), is_baytarian=user.is_baytarian,
                   is_vet_student=user.is_vet_student), 201
