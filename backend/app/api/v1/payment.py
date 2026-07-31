import json
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import (
    Bundle, Course, Enrollment, Lesson, Payment, User, VideoEntitlement, push_notification,
)
from ...models.payment import PAYMENT_KINDS
from ...models.learning import merge_access_expiry
from ...security import require_role
from ...services.catalog_access import access_is_paid, audience_error, video_is_standalone
from ...services import fawaterk
from ...services.fawaterk import FawaterkError
from ...utils import renewal_percent

bp = Blueprint("payment", __name__)


def _uid():
    return int(get_jwt_identity())


def _now():
    return datetime.now(timezone.utc)


# ----------------------------- target resolution + grant -----------------------------

def _resolve_target(kind, course_id, bundle_id, video_id, uid):
    """Validate the purchase target and compute the expected amount.
    Returns (ctx, error_tuple). ctx includes exactly one purchase target."""
    if kind not in PAYMENT_KINDS:
        return None, (jsonify(error="invalid_payment_kind"), 422)

    buyer = db.session.get(User, uid)
    if kind == "video":
        video = Lesson.query.filter_by(id=video_id, status="published").first() if video_id else None
        if not video:
            return None, (jsonify(error="video_not_found"), 404)
        if not video_is_standalone(video):
            return None, (jsonify(error="video_not_standalone"), 409)
        if not access_is_paid(video.access_type):
            return None, (jsonify(error="not_purchasable"), 409)
        reason = audience_error(buyer, video.access_type)
        if reason:
            return None, (jsonify(error=reason), 403)
        entitlement = VideoEntitlement.query.filter_by(
            user_id=uid, video_id=video.id, status="active",
        ).first()
        if entitlement and entitlement.has_access():
            return None, (jsonify(error="already_entitled"), 409)
        return {
            "kind": "video", "course": None, "bundle": None, "video": video,
            "expected": float(video.price), "title": video.title,
        }, None

    if kind == "bundle":
        bundle = Bundle.query.filter_by(id=bundle_id, status="published").first() if bundle_id else None
        if not bundle:
            return None, (jsonify(error="bundle_not_found"), 404)
        if not access_is_paid(bundle.access_type):
            return None, (jsonify(error="not_purchasable"), 409)
        reason = audience_error(buyer, bundle.access_type)
        if reason:
            return None, (jsonify(error=reason), 403)
        cids = [c.id for c in bundle.courses]
        vids = [video.id for video in bundle.videos]
        courses_covered = not cids
        if cids:
            active = {e.course_id for e in Enrollment.query.filter(
                Enrollment.user_id == uid, Enrollment.course_id.in_(cids), Enrollment.status == "active"
            ).all() if not e.is_expired()}
            courses_covered = set(cids) <= active
        videos_covered = not vids
        if vids:
            active_videos = {
                entitlement.video_id for entitlement in VideoEntitlement.query.filter(
                    VideoEntitlement.user_id == uid,
                    VideoEntitlement.video_id.in_(vids),
                    VideoEntitlement.status == "active",
                ).all() if entitlement.has_access()
            }
            videos_covered = set(vids) <= active_videos
        if (cids or vids) and courses_covered and videos_covered:
            return None, (jsonify(error="already_entitled"), 409)
        return {"kind": "bundle", "course": None, "bundle": bundle, "video": None,
                "expected": float(bundle.price), "title": bundle.title}, None

    course = Course.query.filter_by(id=course_id, status="published").first() if course_id else None
    if not course:
        return None, (jsonify(error="course_not_found"), 404)
    if not course.is_paid():
        return None, (jsonify(error="not_purchasable"), 409)  # free / vet_free
    buyer = db.session.get(User, uid)
    reason = audience_error(buyer, course.access_type)
    if reason:
        return None, (jsonify(error=reason), 403)
    enr = Enrollment.query.filter_by(user_id=uid, course_id=course.id, status="active").first()

    if kind == "renewal":
        if not enr:
            return None, (jsonify(error="not_enrolled"), 409)
        if not course.access_days:
            return None, (jsonify(error="course_is_lifetime"), 409)
        expected = round(float(course.price) * renewal_percent() / 100.0, 2)
        return {"kind": "renewal", "course": course, "bundle": None, "video": None,
                "expected": expected, "title": course.title}, None

    if enr and not enr.is_expired():
        return None, (jsonify(error="already_enrolled"), 409)
    return {"kind": "enroll", "course": course, "bundle": None, "video": None,
            "expected": float(course.price), "title": course.title}, None


def _enroll_course(uid, course, access_days):
    """Upsert an active enrollment; bump count only on first enroll; fresh access window."""
    enr = Enrollment.query.filter_by(user_id=uid, course_id=course.id).first()
    if enr:
        expires_at = merge_access_expiry(enr.status, enr.expires_at, access_days)
        enr.status = "active"
        enr.expires_at = expires_at
    else:
        enr = Enrollment(user_id=uid, course_id=course.id, source="purchase", status="active",
                         expires_at=Enrollment.compute_expiry(access_days))
        db.session.add(enr)
        course.enrolled_count = (course.enrolled_count or 0) + 1
    return enr


def _grant_video(uid, video, access_days, source):
    """Upsert one active video entitlement with a fresh access window."""
    entitlement = VideoEntitlement.query.filter_by(user_id=uid, video_id=video.id).first()
    if entitlement:
        expires_at = merge_access_expiry(entitlement.status, entitlement.expires_at, access_days)
        entitlement.status = "active"
        entitlement.source = source
        entitlement.expires_at = expires_at
    else:
        entitlement = VideoEntitlement(
            user_id=uid, video_id=video.id, source=source, status="active",
            expires_at=Enrollment.compute_expiry(access_days),
        )
        db.session.add(entitlement)
    return entitlement


def _apply_paid(p):
    """Grant access for a paid payment. Caller wraps this in one atomic commit
    (البند2 SQL-Transaction). Idempotent: a re-delivered 'paid' webhook is a no-op."""
    if p.status == "paid":
        return
    p.status = "paid"
    p.paid_at = _now()
    if p.kind == "renewal":
        course = db.session.get(Course, p.course_id)
        enr = Enrollment.query.filter_by(user_id=p.user_id, course_id=p.course_id).first() \
            or _enroll_course(p.user_id, course, course.access_days)
        enr.status = "active"
        enr.extend(course.access_days)
        push_notification(p.user_id, "payment_approved", "تم تجديد اشتراكك ✅",
                          f"تم تمديد صلاحية «{course.title}». تابع التعلّم الآن.")
    elif p.kind == "bundle":
        bundle = db.session.get(Bundle, p.bundle_id)
        for c in bundle.courses:
            _enroll_course(p.user_id, c, bundle.access_days)
        for video in bundle.videos:
            _grant_video(p.user_id, video, bundle.access_days, "bundle")
        push_notification(p.user_id, "payment_approved", "تم قبول دفعتك ✅",
                          f"تم تفعيل اشتراكك في حزمة «{bundle.title}».")
    elif p.kind == "video":
        video = db.session.get(Lesson, p.video_id)
        _grant_video(p.user_id, video, video.access_days, "purchase")
        push_notification(p.user_id, "payment_approved", "تم قبول دفعتك ✅",
                          f"تم تفعيل وصولك إلى «{video.title}».")
    else:  # enroll
        course = db.session.get(Course, p.course_id)
        _enroll_course(p.user_id, course, course.access_days)
        push_notification(p.user_id, "payment_approved", "تم قبول دفعتك ✅",
                          f"تم تفعيل اشتراكك في «{course.title}». ابدأ التعلّم الآن.")


# ----------------------------- student -----------------------------

@bp.get("/payment/quote")
@jwt_required()
def payment_quote():
    """Expected amount + title for an enroll/renewal/bundle purchase."""
    kind = request.args.get("kind", "enroll")
    ctx, err = _resolve_target(
        kind, request.args.get("course_id", type=int), request.args.get("bundle_id", type=int),
        request.args.get("video_id", type=int), _uid(),
    )
    if err:
        body, code = err
        return body, code
    return jsonify(kind=ctx["kind"], expected_amount=ctx["expected"], title=ctx["title"],
                   renewal_percent=renewal_percent() if kind == "renewal" else None)


@bp.post("/payment/checkout")
@jwt_required()
def checkout():
    """Create a pending Payment and a Fawaterak hosted invoice; return the redirect URL."""
    d = request.get_json() or {}
    kind = d.get("kind", "enroll")
    ctx, err = _resolve_target(kind, d.get("course_id"), d.get("bundle_id"), d.get("video_id"), _uid())
    if err:
        body, code = err
        return body, code
    if not fawaterk.configured():
        return jsonify(error="gateway_not_configured"), 503

    user = db.session.get(User, _uid())
    p = Payment(user_id=user.id, kind=ctx["kind"],
                course_id=ctx["course"].id if ctx["course"] else None,
                bundle_id=ctx["bundle"].id if ctx["bundle"] else None,
                video_id=ctx["video"].id if ctx["video"] else None,
                amount=ctx["expected"], currency="EGP", status="pending", gateway="fawaterk")
    db.session.add(p)
    db.session.flush()  # assign p.id for payLoad

    site = current_app.config["SITE_URL"].rstrip("/")
    parts = (user.name or "").strip().split(" ", 1)
    customer = {"first_name": parts[0] or "Baytara", "last_name": (parts[1] if len(parts) > 1 else "."),
                "email": user.email, "phone": user.phone or ""}
    items = [{"name": ctx["title"][:120], "price": float(ctx["expected"]), "quantity": 1}]
    redirect_urls = {
        "successUrl": f"{site}/payment/callback?status=success&pid={p.id}",
        "failUrl": f"{site}/payment/callback?status=fail&pid={p.id}",
        "pendingUrl": f"{site}/payment/callback?status=pending&pid={p.id}",
        "webhookUrl": f"{site}/api/v1/payment/fawaterk/webhook",
    }
    try:
        r = fawaterk.create_invoice_link(ctx["expected"], "EGP", customer, items,
                                         {"payment_id": p.id}, redirect_urls)
    except FawaterkError as e:
        db.session.rollback()
        return jsonify(error="gateway_error", detail=str(e)), 502
    p.invoice_id = r["invoice_id"]
    p.invoice_key = r["invoice_key"]
    p.pay_url = r["url"]
    db.session.commit()
    return jsonify(url=r["url"], payment_id=p.id), 201


@bp.get("/payment/mine")
@jwt_required()
def my_payments():
    rows = Payment.query.filter_by(user_id=_uid()).order_by(Payment.created_at.desc()).all()
    return jsonify(payments=[p.to_dict() for p in rows])


@bp.get("/payment/<int:pid>")
@jwt_required()
def payment_status(pid):
    p = db.session.get(Payment, pid)
    if not p or p.user_id != _uid():
        return jsonify(error="not_found"), 404
    return jsonify(payment=p.to_dict())


# ----------------------------- Fawaterak webhook (public, HMAC-verified) -----------------------------

@bp.post("/payment/fawaterk/webhook")
def fawaterk_webhook():
    payload = request.get_json(silent=True) or {}
    res = fawaterk.verify_webhook(payload)
    if not res.get("ok"):
        return jsonify(error="invalid_signature"), 400

    # locate the payment: prefer our echoed payLoad.payment_id, else invoice_id
    pl = res.get("pay_load")
    if isinstance(pl, str):
        try:
            pl = json.loads(pl)
        except ValueError:
            pl = None
    pid = pl.get("payment_id") if isinstance(pl, dict) else None
    p = db.session.get(Payment, pid) if pid else \
        Payment.query.filter_by(invoice_id=res.get("invoice_id")).first()
    if not p:
        return jsonify(error="unknown_payment"), 404

    p.payment_method = res.get("payment_method") or p.payment_method
    p.reference_number = res.get("reference_number") or p.reference_number
    try:
        if res["status"] == "paid":
            _apply_paid(p)  # atomic grant
        elif res["status"] in ("failed", "expired", "refunded") and p.status != "paid":
            p.status = res["status"]
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        raise
    return jsonify(ok=True)


# ----------------------------- admin (transactions, read-only) -----------------------------

@bp.get("/admin/payments")
@require_role("admin")
def admin_list():
    q = Payment.query
    status = request.args.get("status")
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(Payment.created_at.desc()).limit(500).all()
    paid = Payment.query.filter_by(status="paid").count()
    revenue = float(db.session.query(db.func.coalesce(db.func.sum(Payment.amount), 0))
                    .filter(Payment.status == "paid").scalar() or 0)
    return jsonify(payments=[p.to_dict(admin=True) for p in rows], paid_count=paid, revenue=revenue)


@bp.get("/admin/payments/<int:pid>")
@require_role("admin")
def admin_detail(pid):
    p = db.session.get(Payment, pid)
    if not p:
        return jsonify(error="not_found"), 404
    d = p.to_dict(admin=True)
    u = db.session.get(User, p.user_id)
    d["user"] = {"id": u.id, "name": u.name, "email": u.email} if u else None
    return jsonify(payment=d)
