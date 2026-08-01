from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required, get_jwt_identity

from ...extensions import db
from ...models import Category, Lesson, User, UserDevice
from ...services.catalog_access import audience_error, video_access
from ...services.video_provider import provider, watermark_for, VideoProviderError
from ...services.video_monitoring import (
    append_playback_event,
    resolve_course_context,
    start_playback_attempt,
    trusted_request_ip,
)
from ...utils import req_lang

bp = Blueprint("video", __name__)


def _current_user():
    ident = get_jwt_identity()
    return db.session.get(User, int(ident)) if ident else None


def _public_video_dict(video, user, lang):
    data = video.to_dict(lang=lang, user=user)
    allowed = video_access(user, video)[0]
    has_phone = bool(user and (user.phone or "").strip())
    data["requires_auth"] = user is None
    data["requires_phone"] = user is not None and not has_phone
    data["can_play"] = bool(user and has_phone and allowed)
    return data


@bp.get("/videos")
@jwt_required(optional=True)
def videos():
    """Published video catalog, localized and filterable by category/access type."""
    user = _current_user()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 12, type=int), 1), 50)
    query = Lesson.query.filter(
        Lesson.status == "published",
        Lesson.vdocipher_video_id.isnot(None),
    )
    category = request.args.get("category")
    if category:
        query = query.join(Category).filter(Category.slug == category)
    access_type = request.args.get("access_type")
    if access_type:
        query = query.filter(Lesson.access_type == access_type)
    search = (request.args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(db.or_(Lesson.title.ilike(like), Lesson.title_en.ilike(like)))
    if audience_error(user, "vet_free"):
        query = query.filter(Lesson.access_type != "vet_free")

    result = db.paginate(
        query.order_by(Lesson.created_at.desc(), Lesson.id.desc()),
        page=page, per_page=per_page, error_out=False,
    )
    lang = req_lang()
    return jsonify(
        videos=[_public_video_dict(video, user, lang) for video in result.items],
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        pages=result.pages,
    )


@bp.get("/videos/<int:video_id>")
@jwt_required(optional=True)
def video_detail(video_id):
    user = _current_user()
    video = db.session.get(Lesson, video_id)
    if not video or video.status != "published" or not video.vdocipher_video_id:
        return jsonify(error="not_found"), 404
    if video.access_type == "vet_free" and audience_error(user, "vet_free"):
        return jsonify(error="not_found"), 404
    return jsonify(video=_public_video_dict(video, user, req_lang()))


@bp.post("/video/playback")
@jwt_required(optional=True)
def playback():
    """Validate enrollment for the lesson's course, then mint a short-lived, watermarked
    VdoCipher OTP. Access is granted here and only here — no public URLs."""
    body = request.get_json(silent=True) or {}
    identity = get_jwt_identity()
    lesson_id = body.get("lesson_id")
    lesson = db.session.get(Lesson, lesson_id) if lesson_id else None
    user = db.session.get(User, int(identity)) if identity else None
    requested_course = resolve_course_context(lesson, body.get("course_id"))
    device_id = request.headers.get("X-Baytara-Device-ID")
    ip_address = trusted_request_ip(request)
    user_agent = request.headers.get("User-Agent")

    def deny(reason, status_code):
        session = start_playback_attempt(
            user, lesson, requested_course, device_id, ip_address, user_agent,
            status="denied", reason=reason,
        )
        db.session.commit()
        return jsonify(error=reason), status_code

    if not user:
        return deny("authentication_required", 401)
    if not user.is_active:
        return deny("account_disabled", 403)
    if not (user.phone or "").strip():
        return deny("phone_required", 403)

    token_device = get_jwt().get("device_id")
    if not token_device or not device_id:
        return deny("device_required", 403)
    if token_device != device_id:
        return deny("device_mismatch", 403)
    device = UserDevice.query.filter_by(user_id=user.id, device_id=device_id).first()
    if not device:
        return deny("device_not_registered", 403)
    if UserDevice.query.filter_by(user_id=user.id).count() > UserDevice.MAX_DEVICES:
        return deny("device_limit_reached", 403)

    if not lesson:
        return deny("lesson_not_found", 404)
    if body.get("course_id") and not requested_course:
        return deny("invalid_course_context", 422)
    if not lesson.vdocipher_video_id:
        return deny("no_video", 409)

    privileged = user is not None and user.role == "admin"
    if lesson.status != "published" and not privileged:
        return deny("not_entitled", 403)
    allowed, reason = video_access(user, lesson)
    if not allowed:
        return deny(reason, 403)

    session = start_playback_attempt(
        user, lesson, requested_course, device_id, ip_address, user_agent,
    )
    try:
        res = provider.issue_otp(
            lesson.vdocipher_video_id,
            annotate=watermark_for(user, ip_address, session.public_id),
        )
    except VideoProviderError as e:
        session.status = "provider_failed"
        session.reason = str(e)[:80]
        append_playback_event(session, "provider_failed", reason=session.reason)
        db.session.commit()
        return jsonify(error=str(e)), 503

    device.last_seen = session.started_at
    append_playback_event(session, "otp_issued")
    db.session.commit()
    return jsonify(otp=res["otp"], playbackInfo=res["playbackInfo"], session_id=session.public_id)
