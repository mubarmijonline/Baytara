import uuid
from datetime import datetime, timedelta, timezone

from ..extensions import db

ENROLL_SOURCES = ("purchase", "assigned", "free")
ENROLL_STATUSES = ("active", "revoked")
VIDEO_ENTITLEMENT_SOURCES = ("purchase", "assigned", "bundle")
VIDEO_ENTITLEMENT_STATUSES = ("active", "revoked")


def _now():
    return datetime.now(timezone.utc)


def _aware(dt):
    """Postgres may hand back naive datetimes; treat them as UTC for comparison."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def merge_access_expiry(status, expires_at, access_days, base=None):
    """Merge a purchase window without shortening active access.

    Active lifetime access stays lifetime. Revoked grants restart from the new
    purchase window, while active finite grants keep the later expiry.
    """
    new_expiry = None if not access_days else (base or _now()) + timedelta(days=int(access_days))
    if status != "active":
        return new_expiry
    if expires_at is None or new_expiry is None:
        return None
    return max(_aware(expires_at), new_expiry)


def _course_lessons_query(course_id):
    """Canonical videos assigned to one course through CourseVideo."""
    from .catalog import CourseVideo, Lesson

    return Lesson.query.join(
        CourseVideo, CourseVideo.video_id == Lesson.id
    ).filter(CourseVideo.course_id == course_id).distinct()


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
    # Admin un-enrollment. The row survives so the learner's progress is still there if
    # they are reinstated, and so there is a record of who removed them and why.
    cancelled_at = db.Column(db.DateTime(timezone=True))
    cancel_reason = db.Column(db.Text)
    cancelled_by = db.Column(db.Integer, db.ForeignKey("users.id"))

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
        lessons = _course_lessons_query(self.course_id).all()
        lesson_ids = {lesson.id for lesson in lessons}
        total = len(lesson_ids)
        completed = sum(
            1 for p in self.progress
            if p.lesson_id in lesson_ids and p.completed_at is not None
        )
        percent = round(completed / total * 100) if total else 0
        return percent, completed, total

    def progress_summary(self):
        percent, completed, total = self.completion()
        lesson_ids = {lesson.id for lesson in _course_lessons_query(self.course_id).all()}
        rows = [p for p in self.progress if p.lesson_id in lesson_ids]
        watched = sum(1 for p in rows if (p.watched_seconds or 0) > 0)
        watched_not_completed = sum(
            1 for p in rows
            if (p.watched_seconds or 0) > 0 and p.completed_at is None
        )
        watched_seconds = sum((p.watched_seconds or 0) for p in rows)
        return {
            "percent": percent,
            "completed_lessons": completed,
            "watched_lessons": watched,
            "watched_not_completed": watched_not_completed,
            "watched_seconds": watched_seconds,
            "total_lessons": total,
        }

    def includes_lesson(self, lesson_id):
        from .catalog import Lesson

        return _course_lessons_query(self.course_id).filter(Lesson.id == lesson_id).first() is not None

    def to_dict(self, lang="ar"):
        return {
            "id": self.id,
            "course": self.course.to_dict(lang=lang) if self.course else None,
            "source": self.source,
            "status": self.status,
            "expires_at": _aware(self.expires_at).isoformat() if self.expires_at else None,
            "is_expired": self.is_expired(),
            "progress": self.progress_summary(),
        }


class Certificate(db.Model):
    """Issued once a learner completes every lesson of a course that offers one.

    The serial is the public handle: /certificates/<serial> verifies it without
    exposing a user id, and the same page is what «تحميل PDF» prints.
    """

    __tablename__ = "certificates"
    __table_args__ = (db.UniqueConstraint("user_id", "course_id", name="uq_certificate_user_course"),)

    id = db.Column(db.Integer, primary_key=True)
    serial = db.Column(db.String(32), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    issued_at = db.Column(db.DateTime(timezone=True), default=_now)

    user = db.relationship("User")
    course = db.relationship("Course")

    @staticmethod
    def new_serial():
        # Short, unambiguous, and not guessable from a user or course id.
        return f"BT-{uuid.uuid4().hex[:10].upper()}"

    def passed_exam(self):
        """Whether this certificate was earned by passing the course exam.

        Read from the attempts rather than from whether the course has an exam today, so a
        certificate keeps saying what it was issued for even if the exam is later
        unpublished. It decides the wording only: on an exam course this document is no
        longer "for completing", and the attendance certificate now carries that name.
        """
        from .exam import CourseExam, ExamAttempt

        return db.session.query(ExamAttempt.id).join(
            CourseExam, CourseExam.id == ExamAttempt.exam_id,
        ).filter(
            CourseExam.course_id == self.course_id,
            ExamAttempt.user_id == self.user_id,
            ExamAttempt.passed.is_(True),
        ).first() is not None

    def to_dict(self, lang="ar"):
        from .catalog import loc

        return {
            "kind": "achievement" if self.passed_exam() else "certificate",
            "serial": self.serial,
            "issued_at": self.issued_at.isoformat() if self.issued_at else None,
            "learner_name": self.user.name if self.user else None,
            "course": {
                "id": self.course.id,
                "slug": self.course.slug,
                "title": loc(self.course.title, self.course.title_en, lang),
            } if self.course else None,
        }


class CompletionCertificate(db.Model):
    """Attendance only: the learner watched the whole course. Not a pass.

    Asked for by the client on 2026-09-17, for learners who do not want to sit the exam:
    "name only, no QR code, no complications". It deliberately has no verification page,
    no QR and no printed serial -- the serial exists only to give the printable page an
    address that cannot be guessed. Kept in its own table so the verified certificate,
    which the client said must not change, is not touched at all.
    """

    __tablename__ = "completion_certificates"
    __table_args__ = (db.UniqueConstraint("user_id", "course_id", name="uq_completion_certificate_user_course"),)

    id = db.Column(db.Integer, primary_key=True)
    serial = db.Column(db.String(32), unique=True, nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    issued_at = db.Column(db.DateTime(timezone=True), default=_now)

    user = db.relationship("User")
    course = db.relationship("Course")

    @staticmethod
    def new_serial():
        return f"BC-{uuid.uuid4().hex[:12].upper()}"

    def to_dict(self, lang="ar"):
        from .catalog import loc

        return {
            "kind": "completion",
            "serial": self.serial,
            "issued_at": self.issued_at.isoformat() if self.issued_at else None,
            "learner_name": self.user.name if self.user else None,
            "course": {
                "id": self.course.id,
                "slug": self.course.slug,
                "title": loc(self.course.title, self.course.title_en, lang),
            } if self.course else None,
        }


def issue_completion_certificate_if_earned(enrollment):
    """The attendance certificate, for a finished course that sets an exam.

    Only where a live exam exists: on a course without one, finishing already earns the
    regular certificate, and a second document saying the same thing would be noise.
    Idempotent, like the certificate it sits beside.
    """
    from .exam import CourseExam

    course = enrollment.course
    if not course or not course.has_certificate:
        return None
    percent, _, total = enrollment.completion()
    if not total or percent < 100:
        return None
    exam = CourseExam.query.filter_by(course_id=course.id).first()
    if not exam or not exam.is_live():
        return None
    existing = CompletionCertificate.query.filter_by(user_id=enrollment.user_id, course_id=course.id).first()
    if existing:
        return existing
    certificate = CompletionCertificate(serial=CompletionCertificate.new_serial(),
                                        user_id=enrollment.user_id, course_id=course.id)
    db.session.add(certificate)
    return certificate


def issue_certificate_if_earned(enrollment):
    """Award a certificate when the course is finished and offers one. Idempotent —
    the unique constraint plus this lookup mean re-completing a lesson cannot mint a
    second one. Returns the certificate when there is one, else None.
    """
    from .exam import CourseExam, passed_attempt

    course = enrollment.course
    if not course or not course.has_certificate:
        return None
    percent, _, total = enrollment.completion()
    if not total or percent < 100:
        return None

    # Watching every video is no longer enough on a course that sets an exam: the
    # certificate says the learner passed it. A course with no exam, or one still being
    # written, is unaffected -- `is_live()` is false for both, so nothing that used to
    # issue a certificate stops doing so.
    exam = CourseExam.query.filter_by(course_id=course.id).first()
    if exam and exam.is_live() and not passed_attempt(exam.id, enrollment.user_id):
        return None

    existing = Certificate.query.filter_by(user_id=enrollment.user_id, course_id=course.id).first()
    if existing:
        return existing
    certificate = Certificate(serial=Certificate.new_serial(),
                              user_id=enrollment.user_id, course_id=course.id)
    db.session.add(certificate)
    return certificate


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


class VideoEntitlement(db.Model):
    __tablename__ = "video_entitlements"
    __table_args__ = (db.UniqueConstraint("user_id", "video_id", name="uq_video_entitlement_user_video"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    video_id = db.Column(db.Integer, db.ForeignKey("lessons.id"), nullable=False, index=True)
    source = db.Column(db.String(20), nullable=False, default="purchase")
    status = db.Column(db.String(20), nullable=False, default="active")
    expires_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    user = db.relationship("User")
    video = db.relationship("Lesson")

    def is_expired(self):
        return self.expires_at is not None and _aware(self.expires_at) <= _now()

    def has_access(self):
        return self.status == "active" and not self.is_expired()
