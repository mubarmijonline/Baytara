from datetime import datetime, timezone
from uuid import uuid4

from ..extensions import db
from ..models import Course, CourseVideo, VideoPlaybackEvent, VideoPlaybackSession


def _now():
    return datetime.now(timezone.utc)


def trusted_request_ip(req):
    """Use Nginx's overwritten client header only across the local proxy boundary."""
    remote = req.remote_addr or ""
    if remote in {"127.0.0.1", "::1"}:
        return (req.headers.get("X-Real-IP") or remote)[:64]
    return remote[:64]


def resolve_course_context(video, course_id):
    if not course_id:
        return None
    try:
        course_id = int(course_id)
    except (TypeError, ValueError):
        return None
    course = db.session.get(Course, course_id)
    if not course or not video:
        return None
    if video.course_id == course.id or video.resolve_course_id() == course.id:
        return course
    assignment = CourseVideo.query.filter_by(course_id=course.id, video_id=video.id).first()
    return course if assignment else None


def append_playback_event(session, event_type, *, reason=None):
    details = {"reason": reason} if reason else None
    event = VideoPlaybackEvent(
        session=session,
        client_event_id=str(uuid4()),
        event_type=event_type,
        position_seconds=session.current_position_seconds,
        watched_seconds=session.watched_seconds,
        covered_seconds=session.covered_seconds,
        details=details,
    )
    db.session.add(event)
    return event


def start_playback_attempt(
    user,
    video,
    course,
    device_id,
    ip_address,
    user_agent,
    *,
    status="issued",
    reason=None,
):
    now = _now()
    session = VideoPlaybackSession(
        public_id=str(uuid4()),
        user_id=user.id if user else None,
        video_id=video.id if video else None,
        course_id=course.id if course else None,
        video_title=(video.title_en or video.title) if video else "",
        category_slug=video.category.slug if video and video.category else None,
        course_title=(course.title_en or course.title) if course else None,
        access_type=video.access_type if video else "free",
        viewer_name=user.name if user else None,
        viewer_email=user.email if user else None,
        viewer_phone=user.phone if user else None,
        device_id=(device_id or "")[:80] or None,
        ip_address=(ip_address or "")[:64] or None,
        user_agent=(user_agent or "")[:500] or None,
        status=status,
        reason=reason,
        duration_seconds=(video.duration_minutes * 60) if video and video.duration_minutes else None,
        started_at=now,
        last_event_at=now,
    )
    db.session.add(session)
    db.session.flush()
    if status in {"denied", "provider_failed"}:
        append_playback_event(session, status, reason=reason)
    return session
