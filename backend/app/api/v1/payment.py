import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, current_app, send_file, send_file, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from ...extensions import db
from ...models import Bundle, Course, Enrollment, InstapayAccount, InstapayPayment, User, push_notification
from ...security import require_role
from ...services.instapay_ocr import parse_receipt, extract_text
from ...utils import renewal_percent

bp = Blueprint("payment", __name__)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
NF = "Not Found"


def _num(v):
    return None if v in (None, NF) else v


def _uid():
    return int(get_jwt_identity())


def _resolve_target(kind, course_id, bundle_id, uid):
    """Validate the purchase target and compute the expected InstaPay amount.
    Returns (ctx dict, error_tuple). ctx has: kind, course, bundle, expected, title."""
    if kind == "bundle":
        bundle = Bundle.query.filter_by(id=bundle_id, status="published").first() if bundle_id else None
        if not bundle:
            return None, (jsonify(error="bundle_not_found"), 404)
        # already fully enrolled in every course?
        cids = [c.id for c in bundle.courses]
        if cids:
            active = {e.course_id for e in Enrollment.query.filter(
                Enrollment.user_id == uid, Enrollment.course_id.in_(cids), Enrollment.status == "active"
            ).all() if not e.is_expired()}
            if set(cids) <= active:
                return None, (jsonify(error="already_enrolled"), 409)
        return {"kind": "bundle", "course": None, "bundle": bundle,
                "expected": float(bundle.price), "title": bundle.title}, None

    course = Course.query.filter_by(id=course_id, status="published").first() if course_id else None
    if not course:
        return None, (jsonify(error="course_not_found"), 404)
    if not course.is_paid():
        return None, (jsonify(error="not_purchasable"), 409)  # free / vet_free
    # baytarian-tier courses require a verified pet-doctor account
    if course.access_type == "baytarian":
        buyer = db.session.get(User, uid)
        if not getattr(buyer, "is_baytarian", False):
            return None, (jsonify(error="needs_baytarian"), 403)
    enr = Enrollment.query.filter_by(user_id=uid, course_id=course.id, status="active").first()

    if kind == "renewal":
        if not enr:
            return None, (jsonify(error="not_enrolled"), 409)
        if not course.access_days:
            return None, (jsonify(error="course_is_lifetime"), 409)  # nothing to renew
        expected = round(float(course.price) * renewal_percent() / 100.0, 2)
        return {"kind": "renewal", "course": course, "bundle": None,
                "expected": expected, "title": course.title}, None

    # default: enroll
    if enr and not enr.is_expired():
        return None, (jsonify(error="already_enrolled"), 409)
    return {"kind": "enroll", "course": course, "bundle": None,
            "expected": float(course.price), "title": course.title}, None


def _enroll_course(uid, course, access_days):
    """Upsert an active enrollment; bump enrolled_count only on first enrollment.
    A repurchase/reactivation starts a fresh access window."""
    enr = Enrollment.query.filter_by(user_id=uid, course_id=course.id).first()
    if enr:
        enr.status = "active"
        enr.expires_at = Enrollment.compute_expiry(access_days)
    else:
        enr = Enrollment(user_id=uid, course_id=course.id, source="purchase", status="active",
                         expires_at=Enrollment.compute_expiry(access_days))
        db.session.add(enr)
        course.enrolled_count = (course.enrolled_count or 0) + 1
    return enr


# ----------------------------- student -----------------------------

@bp.get("/payment/quote")
@jwt_required()
def payment_quote():
    """Expected InstaPay amount + title for an enroll/renewal/bundle purchase (shown
    to the student before they upload the receipt)."""
    kind = request.args.get("kind", "enroll")
    ctx, err = _resolve_target(kind, request.args.get("course_id", type=int),
                               request.args.get("bundle_id", type=int), _uid())
    if err:
        body, code = err
        return body, code
    return jsonify(kind=ctx["kind"], expected_amount=ctx["expected"], title=ctx["title"],
                   renewal_percent=renewal_percent() if kind == "renewal" else None)


@bp.post("/payment/instapay/analyze")
@jwt_required()
def analyze_receipt():
    """Preview step: OCR-parse the uploaded receipt + run all validations (incl. reference
    dedup against pending/approved) WITHOUT creating a payment. Nothing is persisted."""
    kind = request.form.get("kind", "enroll")
    ctx, err = _resolve_target(kind, request.form.get("course_id", type=int),
                               request.form.get("bundle_id", type=int), _uid())
    if err:
        body, code = err
        return body, code
    file = request.files.get("image")
    if not file or file.filename == "":
        return jsonify(error="image_required"), 400
    if file.mimetype not in ALLOWED_TYPES:
        return jsonify(error="unsupported_media_type", allowed=sorted(ALLOWED_TYPES)), 415

    import tempfile
    fd, tmp = tempfile.mkstemp(suffix=os.path.splitext(secure_filename(file.filename))[1] or ".png")
    try:
        with os.fdopen(fd, "wb") as f:
            file.save(f)
        try:
            text = extract_text(tmp)
            ocr_ok = True
        except Exception:  # noqa: BLE001
            text, ocr_ok = "No text found", False
    finally:
        os.unlink(tmp)

    accounts = InstapayAccount.query.filter_by(active=True).all()
    parsed = parse_receipt(text, accounts)

    # MUST: reference not already used in a pending or approved payment
    ref = _num(parsed.get("reference"))
    reference_used = bool(ref) and InstapayPayment.query.filter(
        InstapayPayment.reference == ref,
        InstapayPayment.status.in_(("pending", "approved")),
    ).first() is not None

    expected = ctx["expected"]
    amount = parsed.get("total_amount")
    return jsonify(
        parsed=parsed,
        ocr_ok=ocr_ok,
        reference_used=reference_used,
        kind=ctx["kind"],
        expected_amount=expected,
        amount_matches_price=(isinstance(amount, (int, float)) and float(amount) >= expected),
    )


@bp.post("/payment/instapay")
@jwt_required()
def submit_receipt():
    kind = request.form.get("kind", "enroll")
    ctx, err = _resolve_target(kind, request.form.get("course_id", type=int),
                               request.form.get("bundle_id", type=int), _uid())
    if err:
        body, code = err
        return body, code
    course = ctx["course"]
    bundle = ctx["bundle"]
    file = request.files.get("image")
    if not file or file.filename == "":
        return jsonify(error="image_required"), 400
    if file.mimetype not in ALLOWED_TYPES:
        return jsonify(error="unsupported_media_type", allowed=sorted(ALLOWED_TYPES)), 415

    # save under INSTAPAY_IMAGE_DIR/{user_id}_{target}/{filename}
    target = f"c{course.id}" if course else f"b{bundle.id}"
    folder = os.path.join(current_app.config["INSTAPAY_IMAGE_DIR"], f"{_uid()}_{target}")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, secure_filename(file.filename))
    file.save(path)

    # OCR (best-effort — if Vision/key unavailable, admin still reviews the image manually)
    try:
        text = extract_text(path)
    except Exception:  # noqa: BLE001
        text = "No text found"
    accounts = InstapayAccount.query.filter_by(active=True).all()
    parsed = parse_receipt(text, accounts)

    ref = _num(parsed.get("reference"))
    if ref:
        dup = InstapayPayment.query.filter(
            InstapayPayment.reference == ref,
            InstapayPayment.status.in_(("pending", "approved")),
        ).first()
        if dup:
            return jsonify(error="reference_already_used", reference=ref), 409

    p = InstapayPayment(
        user_id=_uid(),
        course_id=course.id if course else None,
        bundle_id=bundle.id if bundle else None,
        kind=ctx["kind"],
        image_path=path,
        status="pending",
        reference=ref,
        transfer_amount=_num(parsed.get("total_amount")),
        total_amount=_num(parsed.get("All_total_amount")),
        fees=_num(parsed.get("fees")),
        tx_date_text=_num(parsed.get("date")),
        note=_num(parsed.get("note")),
        sender_name=_num(parsed.get("sender_name")),
        sender_account=_num(parsed.get("sender_account")),
        receiver_account=_num(parsed.get("receiver_account")),
        receiver_hash=_num(parsed.get("receiver_hash")),
        transaction_approved=parsed.get("transaction_approved"),
        ogs_account_found=parsed.get("ogs_account_found"),
        is_total_amount_correct=parsed.get("is_total_amount_correct"),
    )
    db.session.add(p)
    db.session.commit()
    return jsonify(payment=p.to_dict(), ocr_state=parsed.get("state")), 201


@bp.get("/payment/instapay/accounts")
def public_accounts():
    """Public: the center's active InstaPay handles so students know where to pay."""
    rows = InstapayAccount.query.filter_by(active=True).all()
    return jsonify(accounts=[{"account_name": a.account_name, "number": a.number, "url": a.url} for a in rows])


@bp.get("/payment/instapay/mine")
@jwt_required()
def my_submissions():
    rows = InstapayPayment.query.filter_by(user_id=_uid()).order_by(InstapayPayment.created_at.desc()).all()
    return jsonify(payments=[p.to_dict() for p in rows])


# ----------------------------- admin -----------------------------

@bp.get("/admin/payments")
@require_role("admin")
def admin_list():
    q = InstapayPayment.query
    status = request.args.get("status")
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(InstapayPayment.created_at.desc()).all()
    return jsonify(payments=[p.to_dict(admin=True) for p in rows])


@bp.get("/admin/payments/<int:pid>/receipt")
@require_role("admin")
def admin_receipt(pid):
    p = db.session.get(InstapayPayment, pid)
    if not p or not p.image_path or not os.path.exists(p.image_path):
        return jsonify(error="not_found"), 404
    return send_file(os.path.abspath(p.image_path))


@bp.post("/admin/payments/<int:pid>/approve")
@require_role("admin")
def admin_approve(pid):
    p = db.session.get(InstapayPayment, pid)
    if not p:
        return jsonify(error="not_found"), 404
    if p.status != "pending":
        return jsonify(error="not_pending", status=p.status), 409
    # re-check reference not approved elsewhere (guards concurrent approvals)
    if p.reference and InstapayPayment.query.filter(
        InstapayPayment.reference == p.reference,
        InstapayPayment.status == "approved",
        InstapayPayment.id != p.id,
    ).first():
        return jsonify(error="reference_already_approved"), 409

    # atomic: approve -> enroll/renew/bundle-enroll -> bump counts (single commit; rollback on error)
    try:
        p.status = "approved"
        p.reviewed_by = _uid()
        p.reviewed_at = datetime.now(timezone.utc)
        enrollment_ids = []

        if p.kind == "renewal":
            course = db.session.get(Course, p.course_id)
            enr = Enrollment.query.filter_by(user_id=p.user_id, course_id=p.course_id).first() \
                or _enroll_course(p.user_id, course, course.access_days)
            enr.status = "active"
            enr.extend(course.access_days)
            enrollment_ids = [enr.id]
            push_notification(p.user_id, "payment_approved", "تم تجديد اشتراكك ✅",
                              f"تم تمديد صلاحية «{course.title}». تابع التعلّم الآن.")
        elif p.kind == "bundle":
            bundle = db.session.get(Bundle, p.bundle_id)
            for c in bundle.courses:
                enrollment_ids.append(_enroll_course(p.user_id, c, bundle.access_days).id)
            push_notification(p.user_id, "payment_approved", "تم قبول دفعتك ✅",
                              f"تم تفعيل اشتراكك في حزمة «{bundle.title}» ({len(bundle.courses)} كورس).")
        else:  # enroll
            course = db.session.get(Course, p.course_id)
            enrollment_ids = [_enroll_course(p.user_id, course, course.access_days).id]
            push_notification(p.user_id, "payment_approved", "تم قبول دفعتك ✅",
                              f"تم تفعيل اشتراكك في «{course.title}». ابدأ التعلّم الآن.")
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        raise
    return jsonify(payment=p.to_dict(admin=True), enrollment_ids=enrollment_ids)


@bp.post("/admin/payments/<int:pid>/reject")
@require_role("admin")
def admin_reject(pid):
    p = db.session.get(InstapayPayment, pid)
    if not p:
        return jsonify(error="not_found"), 404
    if p.status != "pending":
        return jsonify(error="not_pending", status=p.status), 409
    p.status = "rejected"
    p.reject_reason = (request.get_json() or {}).get("reason")
    p.reviewed_by = _uid()
    p.reviewed_at = datetime.now(timezone.utc)
    push_notification(p.user_id, "payment_rejected", "لم يُقبل إيصال الدفع",
                      p.reject_reason or "يرجى مراجعة الإيصال وإعادة الإرسال.")
    db.session.commit()
    return jsonify(payment=p.to_dict(admin=True))


# --------------------- admin: InstaPay account whitelist ---------------------

@bp.get("/admin/instapay-accounts")
@require_role("admin")
def accounts_list():
    return jsonify(accounts=[a.to_dict() for a in InstapayAccount.query.all()])


@bp.post("/admin/instapay-accounts")
@require_role("admin")
def accounts_create():
    data = request.get_json() or {}
    if not data.get("account_name"):
        return jsonify(error="account_name_required"), 422
    if not data.get("number") and not data.get("url"):
        return jsonify(error="number_or_url_required"), 422
    a = InstapayAccount(
        account_name=data["account_name"],
        number=data.get("number"),
        url=data.get("url"),
        active=data.get("active", True),
    )
    db.session.add(a)
    db.session.commit()
    return jsonify(account=a.to_dict()), 201


@bp.patch("/admin/instapay-accounts/<int:account_id>")
@require_role("admin")
def accounts_update(account_id):
    a = db.session.get(InstapayAccount, account_id)
    if not a:
        return jsonify(error="not_found"), 404
    data = request.get_json() or {}
    for field in ("account_name", "number", "url", "active"):
        if field in data:
            setattr(a, field, data[field])
    db.session.commit()
    return jsonify(account=a.to_dict())
