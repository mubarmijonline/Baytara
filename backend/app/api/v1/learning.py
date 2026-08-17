from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import (
    Certificate, Course, CourseModule, Lesson, Enrollment, LessonProgress, Payment, User,
    issue_certificate_if_earned,
)
from ...models.catalog import loc
from ...models.video_monitoring import VideoPlaybackSession
from ...utils import req_lang

bp = Blueprint("learning", __name__)

# A watch only counts once the viewer actually got a stream; refusals and provider
# outages are not learning activity.
WATCHED_STATUSES = ("issued", "playing", "paused", "completed", "error", "abandoned")


def _uid():
    return int(get_jwt_identity())


@bp.get("/enrollments")
@jwt_required()
def my_enrollments():
    rows = Enrollment.query.filter_by(user_id=_uid(), status="active").all()
    return jsonify(enrollments=[e.to_dict(lang=req_lang()) for e in rows])


@bp.post("/enrollments")
@jwt_required()
def enroll():
    data = request.get_json() or {}
    course_id = data.get("course_id")
    course = Course.query.filter_by(id=course_id, status="published").first()
    if not course:
        return jsonify(error="course_not_found"), 404

    existing = Enrollment.query.filter_by(user_id=_uid(), course_id=course.id).first()
    if existing and existing.status != "cancelled":
        return jsonify(enrollment=existing.to_dict()), 200

    # Paid tiers (baytarian/general) go through the payment flow.
    if course.is_paid():
        return jsonify(error="payment_required"), 402
    user = db.session.get(User, _uid())
    reason = course.lock_reason(user)
    if reason:  # e.g. vet_free for a non-instructor
        return jsonify(error=reason), 403

    # A course with no fee is not joined at all: nothing is recorded and the learner
    # simply watches. An enrollment only ever means "this seat was bought", which is
    # what makes it worth blocking a delete or refunding. Free courses therefore have
    # no progress, no certificate and no row in «كورساتي» — they are open content.
    return jsonify(enrollment=None, free=True), 200


# ------------------------------ home summary ------------------------------

def _utc_date(value):
    """Calendar date of a stored timestamp. SQLite hands back naive datetimes."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).date()


def _streak_days(days):
    """Length of the run of consecutive days ending today or yesterday. Yesterday counts
    so the streak does not read as broken before the user has watched anything today."""
    today = datetime.now(timezone.utc).date()
    cursor = today if today in days else today - timedelta(days=1)
    if cursor not in days:
        return 0
    total = 0
    while cursor in days:
        total += 1
        cursor -= timedelta(days=1)
    return total


def _resume(user_id, lang):
    """Where the learner left off: the newest watched course video that still sits behind a
    live enrollment. Returns None when there is nothing to resume."""
    rows = (VideoPlaybackSession.query
            .filter(VideoPlaybackSession.user_id == user_id,
                    VideoPlaybackSession.course_id.isnot(None),
                    VideoPlaybackSession.status.in_(WATCHED_STATUSES))
            .order_by(VideoPlaybackSession.last_event_at.desc())
            .limit(20).all())
    for row in rows:
        enrollment = Enrollment.query.filter_by(
            user_id=user_id, course_id=row.course_id, status="active").first()
        if not enrollment or enrollment.is_expired():
            continue
        course = enrollment.course
        videos = course.content_videos()
        if not videos:
            continue
        done = {p.lesson_id for p in enrollment.progress if p.completed_at is not None}
        # The lesson to open next: the first unfinished one, or the last if the course is done.
        index = next((i for i, v in enumerate(videos) if v.id not in done), len(videos) - 1)
        lesson = videos[index]
        total = len(videos)
        percent, _, _ = enrollment.completion()
        return {
            "course": {"id": course.id, "slug": course.slug,
                       "title": loc(course.title, course.title_en, lang)},
            "lesson": {"id": lesson.id, "title": loc(lesson.title, lesson.title_en, lang),
                       "poster": lesson.poster},
            "lesson_index": index + 1,
            "total_lessons": total,
            "remaining_lessons": total - (index + 1),
            "percent": percent,
        }
    return None


def learning_summary(user_id, lang="ar"):
    """The figures behind the home page's «أكمل من حيث توقفت» card.

    ponytail: derived from video_playback_sessions, which nothing prunes today. Add a
    user_activity_days table only if a retention job starts deleting those rows — the
    response shape does not change.

    A streak day means a video was *started* that day; browsing does not count.
    """
    # One unbounded pass: the hours tile means lifetime, so it cannot carry a date filter,
    # and the streak only ever walks backwards from today, so the extra rows cost nothing.
    rows = (db.session.query(VideoPlaybackSession.started_at, VideoPlaybackSession.watched_seconds)
            .filter(VideoPlaybackSession.user_id == user_id,
                    VideoPlaybackSession.status.in_(WATCHED_STATUSES))
            .all())
    days = {d for d in (_utc_date(started) for started, _ in rows) if d}
    watched_seconds = sum((seconds or 0) for _, seconds in rows)
    return {
        "courses_enrolled": Enrollment.query.filter_by(user_id=user_id, status="active").count(),
        "watched_hours": watched_seconds // 3600,
        "streak_days": _streak_days(days),
        "resume": _resume(user_id, lang),
    }


@bp.get("/learning-summary")
@jwt_required()
def my_learning_summary():
    return jsonify(**learning_summary(_uid(), lang=req_lang()))


@bp.get("/progress")
@jwt_required()
def get_progress():
    """Persisted per-lesson progress for the current user in a course (?course=<slug>)."""
    slug = request.args.get("course")
    course = Course.query.filter_by(slug=slug, status="published").first() if slug else None
    if not course:
        return jsonify(error="course_not_found"), 404
    enr = Enrollment.query.filter_by(user_id=_uid(), course_id=course.id, status="active").first()
    if not enr:
        return jsonify(enrolled=False, lessons={}, percent=0)
    lessons = {
        p.lesson_id: {"completed": p.completed_at is not None, "watched_seconds": p.watched_seconds or 0}
        for p in enr.progress
    }
    percent, completed, total = enr.completion()
    return jsonify(enrolled=True, expired=enr.is_expired(),
                   expires_at=enr.to_dict()["expires_at"],
                   lessons=lessons, percent=percent, completed=completed, total=total)


@bp.post("/progress")
@jwt_required()
def update_progress():
    """Upsert lesson progress for the current user's enrollment owning that lesson."""
    data = request.get_json() or {}
    lesson_id = data.get("lesson_id")
    lesson = db.session.get(Lesson, lesson_id) if lesson_id else None
    if not lesson:
        return jsonify(error="lesson_not_found"), 404

    course_id = data.get("course_id")
    enrollments = Enrollment.query.filter_by(user_id=_uid(), status="active")
    if course_id:
        enrollment = enrollments.filter_by(course_id=course_id).first()
        if enrollment and not enrollment.includes_lesson(lesson.id):
            enrollment = None
    else:
        matches = [enrollment for enrollment in enrollments.all() if enrollment.includes_lesson(lesson.id)]
        enrollment = next((item for item in matches if not item.is_expired()), matches[0] if matches else None)
    if not enrollment:
        return jsonify(error="not_enrolled"), 403
    if enrollment.is_expired():
        return jsonify(error="access_expired"), 403

    prog = LessonProgress.query.filter_by(enrollment_id=enrollment.id, lesson_id=lesson.id).first()
    if not prog:
        prog = LessonProgress(enrollment_id=enrollment.id, lesson_id=lesson.id)
        db.session.add(prog)

    if "watched_seconds" in data:
        prog.watched_seconds = max(int(data["watched_seconds"]), prog.watched_seconds or 0)
    if data.get("completed"):
        prog.completed_at = prog.completed_at or datetime.now(timezone.utc)

    db.session.flush()
    # Finishing the last lesson is what earns the certificate; the helper is idempotent.
    certificate = issue_certificate_if_earned(enrollment)
    db.session.commit()
    percent, completed, total = enrollment.completion()
    return jsonify(progress={"percent": percent, "completed_lessons": completed, "total_lessons": total},
                   certificate=certificate.to_dict(req_lang()) if certificate else None)


# ------------------------------ certificates ------------------------------

@bp.get("/certificates")
@jwt_required()
def my_certificates():
    rows = (Certificate.query.filter_by(user_id=_uid())
            .order_by(Certificate.issued_at.desc(), Certificate.id.desc()).all())
    return jsonify(certificates=[c.to_dict(req_lang()) for c in rows])


@bp.get("/certificates/<serial>")
def verify_certificate(serial):
    """Public: anyone holding the serial can confirm the certificate is real. It
    exposes the learner's name and the course, and nothing else about the account."""
    certificate = Certificate.query.filter_by(serial=serial).first()
    if not certificate:
        return jsonify(error="not_found"), 404
    return jsonify(certificate=certificate.to_dict(req_lang()), valid=True)


# ------------------------------ activity ------------------------------

@bp.get("/activity")
@jwt_required()
def my_activity():
    """One time-sorted feed.

    ponytail: derived from rows three features already write — lesson completions,
    playback sessions and payments — rather than a user_activity table that would have
    to be kept in step with all three.
    """
    user_id = _uid()
    items = []

    enrollments = Enrollment.query.filter_by(user_id=user_id, status="active").all()
    titles = {}
    for enrollment in enrollments:
        course = enrollment.course
        if not course:
            continue
        for lesson in course.content_videos():
            titles[lesson.id] = (lesson, course)
        for entry in enrollment.progress:
            if entry.completed_at and entry.lesson_id in titles:
                lesson, lesson_course = titles[entry.lesson_id]
                items.append({
                    "type": "lesson_completed", "at": entry.completed_at,
                    "title": lesson.title, "context": lesson_course.title,
                    "href": f"/learn/{lesson_course.slug}/{lesson.id}",
                })

    for certificate in Certificate.query.filter_by(user_id=user_id).all():
        items.append({
            "type": "certificate", "at": certificate.issued_at,
            "title": certificate.course.title if certificate.course else "",
            "context": certificate.serial, "href": f"/certificates/{certificate.serial}",
        })

    for payment in Payment.query.filter_by(user_id=user_id, status="paid").all():
        bought = payment.course or payment.bundle or payment.video
        items.append({
            "type": "purchase", "at": payment.paid_at or payment.created_at,
            "title": getattr(bought, "title", "") or "",
            "context": f"{float(payment.amount or 0):g} {payment.currency}",
            "href": "/dashboard/payments",
        })

    items = [i for i in items if i["at"]]
    items.sort(key=lambda i: i["at"], reverse=True)
    limit = min(max(request.args.get("limit", 10, type=int), 1), 50)
    return jsonify(activity=[{**i, "at": i["at"].isoformat()} for i in items[:limit]])
