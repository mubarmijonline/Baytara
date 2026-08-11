from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt, jwt_required, get_jwt_identity

from ...extensions import db
from ...models import Category, Lesson, User, UserDevice, VideoPlaybackSession
from ...services.catalog_access import audience_error, capture_protected, video_access
from ...services.video_provider import provider, watermark_for, VideoProviderError
from ...services.video_monitoring import (
    PlaybackEventError,
    append_playback_event,
    playback_session_state,
    record_playback_event,
    resolve_course_context,
    start_playback_attempt,
    trusted_request_ip,
)
from ...utils import (baytara_app, inapp_webview, mac_without_safari, mobile_browser,
                      mobile_requires_app, protected_browser, req_lang, strict_browser_policy)

bp = Blueprint("video", __name__)

# Sharing limits. They do not stop a viewer recording their own screen — nothing in a
# browser can — but they stop one account from serving a group, which is how a leak
# actually spreads. Admins are exempt so support can always reproduce a report.
LIVE_STATUSES = ("issued", "playing", "paused")
CONCURRENT_GRACE = timedelta(minutes=2)   # the player heartbeats every 15s
OTP_WINDOW = timedelta(hours=1)
OTP_PER_WINDOW = 40                       # a fresh lesson every 90 seconds, all hour


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


def _resume_position_seconds(user, lesson):
    if not user or not lesson:
        return 0
    session = VideoPlaybackSession.query.filter(
        VideoPlaybackSession.user_id == user.id,
        VideoPlaybackSession.video_id == lesson.id,
        VideoPlaybackSession.current_position_seconds > 0,
        VideoPlaybackSession.status.notin_(["denied", "provider_failed", "completed"]),
    ).order_by(
        VideoPlaybackSession.last_event_at.desc(),
        VideoPlaybackSession.id.desc(),
    ).first()
    if not session or session.completion_percent >= 90:
        return 0
    duration = session.duration_seconds or ((lesson.duration_minutes or 0) * 60)
    position = max(0, int(session.current_position_seconds or 0))
    if duration and position >= max(duration - 5, 0):
        return 0
    return position


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


@bp.get("/video/my-progress")
@jwt_required()
def my_video_progress():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return jsonify(error="invalid_user"), 401
    rows = VideoPlaybackSession.query.filter(
        VideoPlaybackSession.user_id == user.id,
        VideoPlaybackSession.video_id.isnot(None),
        VideoPlaybackSession.status.notin_(["denied", "provider_failed"]),
    ).order_by(VideoPlaybackSession.last_event_at.desc(), VideoPlaybackSession.id.desc()).limit(80).all()
    latest = []
    seen = set()
    for session in rows:
        if session.video_id in seen:
            continue
        seen.add(session.video_id)
        video = session.video
        latest.append({
            "id": session.video_id,
            "title": video.to_dict(lang=req_lang(), user=user)["title"] if video else session.video_title,
            "category": video.category.slug if video and video.category else session.category_slug,
            "access_type": session.access_type,
            "status": session.status,
            "completion_percent": session.completion_percent,
            "watched_seconds": session.watched_seconds,
            "duration_seconds": session.duration_seconds,
            "last_event_at": session.last_event_at.isoformat() if session.last_event_at else None,
            "completed_at": session.completed_at.isoformat() if session.completed_at else None,
        })
        if len(latest) >= 10:
            break
    return jsonify(videos=latest)


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
    if capture_protected(lesson) and not baytara_app(user_agent):
        # No OTP is minted at all for a client that cannot defend the stream. On a phone
        # that means the app only: a mobile browser hands the audio track to any screen
        # recorder and cannot be told a recording started. On a Mac only Safari + FairPlay
        # blocks recording, and a social in-app webview has no dependable DRM anywhere.
        # A UA can be spoofed, so the dynamic watermark below stays on regardless.
        if mobile_browser(user_agent) and mobile_requires_app():
            # Admin chose app-only for phones. Off by default: a mobile browser plays,
            # it just cannot stop a recorder taking the audio.
            return deny("app_required", 403)
        if mac_without_safari(user_agent):
            return deny("mac_needs_safari", 403)
        if inapp_webview(user_agent):
            return deny("unsupported_browser", 403)
        if strict_browser_policy() and not protected_browser(user_agent):
            # Strictest web setting: only browsers whose DRM is hardware-enforced. Keeps
            # Windows Chrome/Firefox and Linux out, where a desktop recorder captures
            # picture and sound at full quality.
            return deny("browser_not_supported", 403)

    if not privileged:
        now = datetime.now(timezone.utc)
        # one stream at a time per account (a reload from the same device is not a second stream)
        live = VideoPlaybackSession.query.filter(
            VideoPlaybackSession.user_id == user.id,
            VideoPlaybackSession.status.in_(LIVE_STATUSES),
            VideoPlaybackSession.last_event_at >= now - CONCURRENT_GRACE,
            VideoPlaybackSession.device_id.isnot(None),
            VideoPlaybackSession.device_id != device_id,
        ).first()
        if live:
            return deny("already_playing", 409)
        minted = VideoPlaybackSession.query.filter(
            VideoPlaybackSession.user_id == user.id,
            VideoPlaybackSession.started_at >= now - OTP_WINDOW,
        ).count()
        if minted >= OTP_PER_WINDOW:
            return deny("too_many_requests", 429)

    resume_position_seconds = _resume_position_seconds(user, lesson)
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
    return jsonify(
        otp=res["otp"],
        playbackInfo=res["playbackInfo"],
        session_id=session.public_id,
        resume_position_seconds=resume_position_seconds,
        # Inaudible audio watermark payload (docs/AUDIO_WATERMARK.md). A screen recorder
        # captures the digital audio mix, so this rides along in any rip of the lesson and
        # names the account afterwards. It cannot stop the recording.
        audio_mark=user.id,
    )


@bp.post("/video/playback-sessions/<session_id>/events")
@jwt_required()
def playback_event(session_id):
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return jsonify(error="invalid_user"), 401
    token_device = get_jwt().get("device_id")
    device_id = request.headers.get("X-Baytara-Device-ID")
    if not token_device or not device_id:
        return jsonify(error="device_required"), 403
    if token_device != device_id:
        return jsonify(error="device_mismatch"), 403
    device = UserDevice.query.filter_by(user_id=user.id, device_id=device_id).first()
    if not device:
        return jsonify(error="device_not_registered"), 403
    session = VideoPlaybackSession.query.filter_by(public_id=session_id).first()
    if not session or session.user_id != user.id:
        return jsonify(error="session_not_found"), 404
    try:
        session = record_playback_event(
            session, user, device_id, request.get_json(silent=True) or {},
        )
    except PlaybackEventError as exc:
        db.session.rollback()
        return jsonify(error=exc.code), exc.status
    device.last_seen = session.last_event_at
    db.session.commit()
    return jsonify(session=playback_session_state(session))
