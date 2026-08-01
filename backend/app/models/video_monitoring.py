from datetime import datetime, timezone

from ..extensions import db


PLAYBACK_SESSION_STATUSES = (
    "denied",
    "provider_failed",
    "issued",
    "playing",
    "paused",
    "completed",
    "error",
    "abandoned",
)
PLAYBACK_EVENT_TYPES = (
    "denied",
    "provider_failed",
    "otp_issued",
    "play",
    "pause",
    "resume",
    "heartbeat",
    "ended",
    "player_error",
    "abandoned",
)


def _now():
    return datetime.now(timezone.utc)


def _iso(value):
    return value.isoformat() if value else None


class VideoPlaybackSession(db.Model):
    __tablename__ = "video_playback_sessions"

    id = db.Column(db.Integer, primary_key=True)
    public_id = db.Column(db.String(36), nullable=False, unique=True, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"), index=True)
    video_id = db.Column(db.Integer, db.ForeignKey("lessons.id", ondelete="SET NULL"), index=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="SET NULL"), index=True)

    video_title = db.Column(db.String(200), nullable=False, default="")
    category_slug = db.Column(db.String(140), index=True)
    course_title = db.Column(db.String(200))
    access_type = db.Column(db.String(20), nullable=False, default="free", index=True)
    viewer_name = db.Column(db.String(120))
    viewer_email = db.Column(db.String(255), index=True)
    viewer_phone = db.Column(db.String(40))

    device_id = db.Column(db.String(80), index=True)
    ip_address = db.Column(db.String(64), index=True)
    user_agent = db.Column(db.String(500))
    status = db.Column(db.String(32), nullable=False, default="issued", index=True)
    reason = db.Column(db.String(80), index=True)

    current_position_seconds = db.Column(db.Integer, nullable=False, default=0)
    max_position_seconds = db.Column(db.Integer, nullable=False, default=0)
    watched_seconds = db.Column(db.Integer, nullable=False, default=0)
    covered_seconds = db.Column(db.Integer, nullable=False, default=0)
    duration_seconds = db.Column(db.Integer)
    completion_percent = db.Column(db.Integer, nullable=False, default=0)

    started_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_now, index=True)
    first_played_at = db.Column(db.DateTime(timezone=True))
    last_event_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_now, index=True)
    completed_at = db.Column(db.DateTime(timezone=True))
    ended_at = db.Column(db.DateTime(timezone=True))

    user = db.relationship("User")
    video = db.relationship("Lesson")
    course = db.relationship("Course")
    events = db.relationship(
        "VideoPlaybackEvent",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="VideoPlaybackEvent.created_at, VideoPlaybackEvent.id",
    )

    def to_admin_dict(self, lang="ar", include_events=True):
        payload = {
            "session_id": self.public_id,
            "viewer": {
                "id": self.user_id,
                "name": self.viewer_name,
                "email": self.viewer_email,
                "phone": self.viewer_phone,
            },
            "video": {"id": self.video_id, "title": self.video_title},
            "category": self.category_slug,
            "course": {"id": self.course_id, "title": self.course_title} if self.course_id else None,
            "access_type": self.access_type,
            "security": {
                "device_id": self.device_id,
                "ip_address": self.ip_address,
                "user_agent": self.user_agent,
            },
            "status": self.status,
            "reason": self.reason,
            "current_position_seconds": self.current_position_seconds,
            "max_position_seconds": self.max_position_seconds,
            "watched_seconds": self.watched_seconds,
            "covered_seconds": self.covered_seconds,
            "duration_seconds": self.duration_seconds,
            "completion_percent": self.completion_percent,
            "started_at": _iso(self.started_at),
            "first_played_at": _iso(self.first_played_at),
            "last_event_at": _iso(self.last_event_at),
            "completed_at": _iso(self.completed_at),
            "ended_at": _iso(self.ended_at),
        }
        if include_events:
            payload["events"] = [event.to_dict() for event in self.events]
        return payload


class VideoPlaybackEvent(db.Model):
    __tablename__ = "video_playback_events"

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(
        db.Integer,
        db.ForeignKey("video_playback_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_event_id = db.Column(db.String(36), nullable=False, unique=True, index=True)
    event_type = db.Column(db.String(32), nullable=False, index=True)
    position_seconds = db.Column(db.Integer)
    watched_seconds = db.Column(db.Integer)
    covered_seconds = db.Column(db.Integer)
    details = db.Column("metadata", db.JSON)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=_now, index=True)

    session = db.relationship("VideoPlaybackSession", back_populates="events")

    def to_dict(self):
        return {
            "id": self.id,
            "event_id": self.client_event_id,
            "type": self.event_type,
            "position_seconds": self.position_seconds,
            "watched_seconds": self.watched_seconds,
            "covered_seconds": self.covered_seconds,
            "metadata": self.details or {},
            "created_at": _iso(self.created_at),
        }
