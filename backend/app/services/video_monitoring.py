from datetime import datetime, timedelta, timezone
from math import ceil, isfinite
from uuid import UUID, uuid4

from ..extensions import db
from ..models import Course, CourseVideo, VideoPlaybackEvent, VideoPlaybackSession


OPEN_SESSION_STATUSES = {"issued", "playing", "paused"}
# "suspicious" is reported by the browser activity guard (frontend/web/src/lib/activityGuard.js)
# when the viewer does something that usually surrounds a capture attempt.
CLIENT_EVENT_TYPES = {"play", "pause", "resume", "heartbeat", "ended", "player_error", "suspicious"}


class PlaybackEventError(ValueError):
    def __init__(self, code, status=422):
        self.code = code
        self.status = status
        super().__init__(code)


def _now():
    return datetime.now(timezone.utc)


def _aware(value):
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


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


def playback_session_state(session):
    return {
        "session_id": session.public_id,
        "status": session.status,
        "current_position_seconds": session.current_position_seconds,
        "max_position_seconds": session.max_position_seconds,
        "watched_seconds": session.watched_seconds,
        "covered_seconds": session.covered_seconds,
        "duration_seconds": session.duration_seconds,
        "completion_percent": session.completion_percent,
    }


def _uuid(value):
    if not isinstance(value, str) or len(value) > 36:
        raise PlaybackEventError("invalid_event_id")
    try:
        return str(UUID(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise PlaybackEventError("invalid_event_id") from exc


def _seconds(payload, key, default=0):
    value = payload.get(key, default)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not isfinite(value):
        raise PlaybackEventError("invalid_event_measurement")
    value = int(value)
    if value < 0 or value > 86400:
        raise PlaybackEventError("invalid_event_measurement")
    return value


def _event_details(payload):
    raw = payload.get("metadata") or {}
    # "reason" carries the activity-guard trigger (printscreen, devtools_open, ...)
    if not isinstance(raw, dict) or set(raw) - {"error_code", "message", "reason"}:
        raise PlaybackEventError("invalid_event_metadata")
    details = {}
    for key, value in raw.items():
        if not isinstance(value, str) or len(value) > 200:
            raise PlaybackEventError("invalid_event_metadata")
        details[key] = value
    return details or None


def record_playback_event(session, user, device_id, payload, now=None):
    if not isinstance(payload, dict):
        raise PlaybackEventError("invalid_event")
    event_id = _uuid(payload.get("event_id"))
    event_type = payload.get("type")
    if event_type not in CLIENT_EVENT_TYPES:
        raise PlaybackEventError("invalid_event_type")

    locked = db.session.execute(
        db.select(VideoPlaybackSession).where(
            VideoPlaybackSession.id == session.id
        ).with_for_update()
    ).scalar_one_or_none()
    if not locked:
        raise PlaybackEventError("session_not_found", 404)
    if locked.user_id != user.id:
        raise PlaybackEventError("session_not_found", 404)
    if locked.device_id != device_id:
        raise PlaybackEventError("device_mismatch", 403)

    duplicate = VideoPlaybackEvent.query.filter_by(client_event_id=event_id).first()
    if duplicate:
        if duplicate.session_id != locked.id:
            raise PlaybackEventError("event_id_conflict", 409)
        return locked
    if locked.status not in OPEN_SESSION_STATUSES:
        raise PlaybackEventError("session_closed", 409)

    position = _seconds(payload, "position_seconds")
    watched = _seconds(payload, "watched_seconds")
    covered = _seconds(payload, "covered_seconds")
    duration = _seconds(payload, "duration_seconds", locked.duration_seconds or 0)
    if duration <= 0:
        raise PlaybackEventError("invalid_event_measurement")

    now = now or _now()
    duration = max(
        duration,
        locked.duration_seconds or 0,
        locked.watched_seconds,
        locked.covered_seconds,
        locked.max_position_seconds,
    )
    elapsed = max((now - _aware(locked.started_at)).total_seconds(), 0)
    allowed_total = ceil(elapsed * 2.5) + 5
    locked.duration_seconds = duration
    locked.watched_seconds = max(
        locked.watched_seconds,
        min(watched, allowed_total, duration),
    )
    locked.covered_seconds = max(
        locked.covered_seconds,
        min(covered, allowed_total, duration),
    )
    locked.current_position_seconds = min(position, duration)
    locked.max_position_seconds = max(locked.max_position_seconds, locked.current_position_seconds)
    locked.completion_percent = min(round(locked.covered_seconds / duration * 100), 100)
    locked.last_event_at = now

    if event_type == "suspicious":
        # never changes the session status; it is an audit trail, and the client has already
        # paused playback itself
        pass
    elif event_type in {"play", "resume", "heartbeat"}:
        locked.status = "playing"
        if not locked.first_played_at:
            locked.first_played_at = now
    elif event_type == "pause":
        locked.status = "paused"
    elif event_type == "ended":
        if locked.completion_percent >= 90:
            locked.status = "completed"
            locked.completed_at = now
        else:
            locked.status = "abandoned"
            locked.reason = "insufficient_coverage"
        locked.ended_at = now
    elif event_type == "player_error":
        locked.status = "error"
        locked.reason = "player_error"
        locked.ended_at = now

    db.session.add(VideoPlaybackEvent(
        session=locked,
        client_event_id=event_id,
        event_type=event_type,
        position_seconds=locked.current_position_seconds,
        watched_seconds=locked.watched_seconds,
        covered_seconds=locked.covered_seconds,
        details=_event_details(payload),
        created_at=now,
    ))
    return locked


def mark_stale_sessions_abandoned(now=None, idle_seconds=60):
    now = now or _now()
    cutoff = now - timedelta(seconds=idle_seconds)
    rows = VideoPlaybackSession.query.filter(
        VideoPlaybackSession.status.in_(OPEN_SESSION_STATUSES),
        VideoPlaybackSession.last_event_at < cutoff,
    ).all()
    for session in rows:
        session.status = "abandoned"
        session.reason = "heartbeat_timeout"
        session.ended_at = now
        append_playback_event(session, "abandoned", reason="heartbeat_timeout")
    if rows:
        db.session.commit()
    return len(rows)
