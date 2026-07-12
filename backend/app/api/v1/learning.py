from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import Course, CourseModule, Lesson, Enrollment, LessonProgress

bp = Blueprint("learning", __name__)


def _uid():
    return int(get_jwt_identity())


@bp.get("/enrollments")
@jwt_required()
def my_enrollments():
    rows = Enrollment.query.filter_by(user_id=_uid(), status="active").all()
    return jsonify(enrollments=[e.to_dict() for e in rows])


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

    # ponytail: only free courses self-enroll here. Paid enrollment is created
    # inside the atomic payment transaction in Phase 4 — reject it at this endpoint.
    if float(course.price) > 0:
        return jsonify(error="payment_required"), 402

    enrollment = Enrollment(user_id=_uid(), course_id=course.id, source="free", status="active")
    db.session.add(enrollment)
    course.enrolled_count = (course.enrolled_count or 0) + 1
    db.session.commit()
    return jsonify(enrollment=enrollment.to_dict()), 201


@bp.post("/progress")
@jwt_required()
def update_progress():
    """Upsert lesson progress for the current user's enrollment owning that lesson."""
    data = request.get_json() or {}
    lesson_id = data.get("lesson_id")
    lesson = db.session.get(Lesson, lesson_id) if lesson_id else None
    if not lesson:
        return jsonify(error="lesson_not_found"), 404

    course_id = db.session.query(CourseModule.course_id).filter_by(id=lesson.module_id).scalar()
    enrollment = Enrollment.query.filter_by(user_id=_uid(), course_id=course_id, status="active").first()
    if not enrollment:
        return jsonify(error="not_enrolled"), 403

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
