import os
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, current_app, send_file, send_file, abort
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from ...extensions import db
from ...models import Course, Enrollment, InstapayAccount, InstapayPayment
from ...security import require_role
from ...services.instapay_ocr import parse_receipt, extract_text

bp = Blueprint("payment", __name__)

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
NF = "Not Found"


def _num(v):
    return None if v in (None, NF) else v


def _uid():
    return int(get_jwt_identity())


# ----------------------------- student -----------------------------

@bp.post("/payment/instapay")
@jwt_required()
def submit_receipt():
    course_id = request.form.get("course_id", type=int)
    file = request.files.get("image")
    course = Course.query.filter_by(id=course_id, status="published").first() if course_id else None
    if not course:
        return jsonify(error="course_not_found"), 404
    if Enrollment.query.filter_by(user_id=_uid(), course_id=course.id, status="active").first():
        return jsonify(error="already_enrolled"), 409
    if not file or file.filename == "":
        return jsonify(error="image_required"), 400
    if file.mimetype not in ALLOWED_TYPES:
        return jsonify(error="unsupported_media_type", allowed=sorted(ALLOWED_TYPES)), 415

    # save under INSTAPAY_IMAGE_DIR/{user_id}_{course_id}/{filename}
    folder = os.path.join(current_app.config["INSTAPAY_IMAGE_DIR"], f"{_uid()}_{course.id}")
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
        course_id=course.id,
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

    # atomic: approve -> enroll -> bump count (single commit; rollback on any error)
    try:
        p.status = "approved"
        p.reviewed_by = _uid()
        p.reviewed_at = datetime.now(timezone.utc)
        enrollment = Enrollment.query.filter_by(user_id=p.user_id, course_id=p.course_id).first()
        if not enrollment:
            enrollment = Enrollment(user_id=p.user_id, course_id=p.course_id, source="purchase", status="active")
            db.session.add(enrollment)
            course = db.session.get(Course, p.course_id)
            course.enrolled_count = (course.enrolled_count or 0) + 1
        # ponytail: invoice + instructor_revenue + notification land in Phase 4b/8.
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        raise
    return jsonify(payment=p.to_dict(admin=True), enrollment_id=enrollment.id)


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
