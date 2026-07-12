from datetime import datetime, timezone

from ..extensions import db

ENROLL_SOURCES = ("purchase", "assigned", "free")
ENROLL_STATUSES = ("active", "revoked")


def _now():
    return datetime.now(timezone.utc)


class Enrollment(db.Model):
    __tablename__ = "enrollments"
    __table_args__ = (db.UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
    source = db.Column(db.String(20), nullable=False, default="free")
    status = db.Column(db.String(20), nullable=False, default="active")
    enrolled_at = db.Column(db.DateTime(timezone=True), default=_now)

    course = db.relationship("Course")
    progress = db.relationship("LessonProgress", back_populates="enrollment", cascade="all, delete-orphan")

    def completion(self):
        """(-> percent int, completed int, total int) computed from lesson_progress."""
        from .catalog import CourseModule, Lesson

        total = (
            db.session.query(Lesson.id)
            .join(CourseModule, Lesson.module_id == CourseModule.id)
            .filter(CourseModule.course_id == self.course_id)
            .count()
        )
        completed = sum(1 for p in self.progress if p.completed_at is not None)
        percent = round(completed / total * 100) if total else 0
        return percent, completed, total

    def to_dict(self):
        percent, completed, total = self.completion()
        return {
            "id": self.id,
            "course": self.course.to_dict() if self.course else None,
            "source": self.source,
            "status": self.status,
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
