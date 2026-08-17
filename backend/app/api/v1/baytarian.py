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
    return jsonify(is_baytarian=user.is_baytarian,
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
        "card rejected for user %s, failed=%s problems=%s\n--- back ---\n%s\n--- front ---\n%s",
        user.id, failed, report.get("problems"),
        (texts.get("back") or "")[:700], (texts.get("front") or "")[:700])


def _check_card(user, texts, today=None):
    """Every rule, in one place, so preview and submit can never disagree."""
    from ...services.vet_card import governorate_agrees, parse_card

    report = parse_card(texts.get("back", ""), texts.get("front", ""), today=today)
    fields = report["fields"]
    problems = []

    if not user.national_id:
        problems.append("national_id_missing_on_profile")
    elif fields["national_id"]["ok"] and fields["national_id"]["value"] != user.national_id:
        # The card belongs to somebody, but not to whoever is holding this account.
        fields["national_id"]["ok"] = False
        fields["national_id"]["problem"] = "does_not_match_profile"

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
    if not user.national_id:
        return jsonify(error="national_id_required"), 422

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
        card_front=saved["front"], card_back=saved["back"],
        ocr_text=f"--- back ---\n{texts.get('back', '')}\n--- front ---\n{texts.get('front', '')}",
        parsed=report, documents=[saved["front"], saved["back"]],
        reviewed_at=datetime.now(timezone.utc),   # reviewed_by stays null: the system did it
    )
    db.session.add(req)
    db.session.flush()
    req.spot_check = req.id % SPOT_CHECK_EVERY == 0

    user.is_baytarian = True
    user.vet_registration_no = fields["registration_no"]["value"]
    user.vet_license_no = fields["license_no"]["value"]
    user.vet_governorate = fields["governorate"]["value"]
    user.vet_card_expires_at = date.fromisoformat(fields["expires_at"]["value"])
    push_notification(_uid(), "baytarian_approved", "تم توثيق حسابك كطبيب بيطري ✅",
                      "تم التحقق من بطاقة النقابة تلقائياً. أصبح بإمكانك الوصول إلى محتوى الأطباء الموثّقين.")
    db.session.commit()
    return jsonify(request=req.to_dict(), is_baytarian=True), 201
