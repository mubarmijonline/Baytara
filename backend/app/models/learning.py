from datetime import datetime, timedelta, timezone

from ..extensions import db

ENROLL_SOURCES = ("purchase", "assigned", "free")
ENROLL_STATUSES = ("active", "revoked")


def _now():
    return datetime.now(timezone.utc)


def _aware(dt):
    """Postgres may hand back naive datetimes; treat them as UTC for comparison."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


class Enrollment(db.Model):
    __tablename__ = "enrollments"
    __table_args__ = (db.UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
    source = db.Column(db.String(20), nullable=False, default="free")
    status = db.Column(db.String(20), nullable=False, default="active")
    enrolled_at = db.Column(db.DateTime(timezone=True), default=_now)
    # Access Duration (contract البند3): NULL = lifetime; else access ends at this instant.
    expires_at = db.Column(db.DateTime(timezone=True))

    course = db.relationship("Course")
    progress = db.relationship("LessonProgress", back_populates="enrollment", cascade="all, delete-orphan")

    def is_expired(self):
        return self.expires_at is not None and _aware(self.expires_at) <= _now()

    def has_access(self):
        return self.status == "active" and not self.is_expired()

    @staticmethod
    def compute_expiry(access_days, base=None):
        """expires_at for a given access window; None (lifetime) when access_days is falsy."""
        if not access_days:
            return None
        return (base or _now()) + timedelta(days=int(access_days))

    def extend(self, access_days):
        """Renewal: extend from the later of now / current expiry (never shorten)."""
        if not access_days:
            self.expires_at = None
            return
        base = max(_now(), _aware(self.expires_at)) if self.expires_at else _now()
        self.expires_at = base + timedelta(days=int(access_days))

    def completion(self):
        """(-> percent int, completed int, total int) computed from lesson_progress."""
        from .catalog import Lesson

        total = Lesson.query.filter_by(course_id=self.course_id).count()
        completed = sum(1 for p in self.progress if p.completed_at is not None)
        percent = round(completed / total * 100) if total else 0
        return percent, completed, total

    def to_dict(self, lang="ar"):
        percent, completed, total = self.completion()
        return {
            "id": self.id,
            "course": self.course.to_dict(lang=lang) if self.course else None,
            "source": self.source,
            "status": self.status,
            "expires_at": _aware(self.expires_at).isoformat() if self.expires_at else None,
            "is_expired": self.is_expired(),
            "progress": {"percent": percent, "completed_lessons": completed, "total_lessons": total},
        }


class LessonProgress(db.Model):
    __tablename__ = "lesson_progress"
    __table_args__ = (
        db.UniqueConstraint("enrollment_id", "lesson_id", name="uq_progress_enrollment_lesson"),
    )

    id = db.Column(db.Integer, primary_key=True)
    enrollment_id = db.Column(db.Integer, db.ForeignKey("enrollments.id"), nullable=False, index=True)
    lesson_id = db.Column(db.Integer, db.ForeignKey("lessons.id"), nullable=False, index=True)
    watched_seconds = db.Column(db.Integer, nullable=False, default=0)
    completed_at = db.Column(db.DateTime(timezone=True))

    enrollment = db.relationship("Enrollment", back_populates="progress")
