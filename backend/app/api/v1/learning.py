from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import Course, CourseModule, Lesson, Enrollment, LessonProgress, User
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
    if existing:
        return jsonify(enrollment=existing.to_dict()), 200

    # Only free-tier courses self-enroll here. Paid tiers (baytarian/general) go
    # through the payment flow; vet_free is free but instructor-only.
    if course.is_paid():
        return jsonify(error="payment_required"), 402
    user = db.session.get(User, _uid())
    reason = course.lock_reason(user)
    if reason:  # e.g. vet_free for a non-instructor
        return jsonify(error=reason), 403

    enrollment = Enrollment(user_id=_uid(), course_id=course.id, source="free", status="active",
                            expires_at=Enrollment.compute_expiry(course.access_days))
    db.session.add(enrollment)
    course.enrolled_count = (course.enrolled_count or 0) + 1
    db.session.commit()
    return jsonify(enrollment=enrollment.to_dict()), 201


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

    db.session.commit()
    percent, completed, total = enrollment.completion()
    return jsonify(progress={"percent": percent, "completed_lessons": completed, "total_lessons": total})
