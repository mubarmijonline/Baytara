"""Instructor portal API. Every route is scoped to the logged-in instructor.
Foreign resources return 404 (not 403) to avoid existence disclosure (plan §9)."""
from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity

from ...extensions import db
from ...models import User, Course, CourseModule, Lesson, Enrollment, InstapayPayment
from ...security import require_role
from ...utils import slugify

bp = Blueprint("instructor", __name__)


def _uid():
    return int(get_jwt_identity())


def _own_course(cid):
    """Course owned by the current instructor, else None (caller returns 404)."""
    c = db.session.get(Course, cid)
    return c if c and c.instructor_id == _uid() else None


def _own_module(mid):
    m = db.session.get(CourseModule, mid)
    return m if m and _own_course(m.course_id) else None


def _own_lesson(lid):
    l = db.session.get(Lesson, lid)
    return l if l and _own_module(l.module_id) else None


def _me():
    return db.session.get(User, _uid())


# ------------------------------ dashboard ------------------------------

@bp.get("/stats")
@require_role("instructor")
def stats():
    my_course_ids = [c.id for c in Course.query.filter_by(instructor_id=_uid()).all()]
    students = (
        db.session.query(Enrollment.user_id)
        .filter(Enrollment.course_id.in_(my_course_ids or [0]), Enrollment.status == "active")
        .distinct().count()
    )
    paid = InstapayPayment.query.filter(
        InstapayPayment.course_id.in_(my_course_ids or [0]), InstapayPayment.status == "approved"
    ).all()
    revenue = sum(float(p.transfer_amount or 0) for p in paid)
    return jsonify(
        courses=len(my_course_ids),
        published=Course.query.filter_by(instructor_id=_uid(), status="published").count(),
        students=students,
        revenue=revenue,
    )


# ------------------------------ courses ------------------------------

@bp.get("/courses")
@require_role("instructor")
def courses_list():
    rows = Course.query.filter_by(instructor_id=_uid()).order_by(Course.created_at.desc()).all()
    return jsonify(courses=[c.to_dict() for c in rows])


@bp.get("/courses/<int:cid>")
@require_role("instructor")
def course_get(cid):
    c = _own_course(cid)
    if not c:
        return jsonify(error="not_found"), 404
    return jsonify(course=c.to_dict(with_content=True))


@bp.post("/courses")
@require_role("instructor")
def course_create():
    d = request.get_json() or {}
    if not d.get("title"):
        return jsonify(error="title_required"), 422
    status = d.get("status", "draft")
    if status not in ("draft", "published", "unpublished"):
        return jsonify(error="bad_status"), 422
    c = Course(
        title=d["title"],
        slug=slugify(d.get("slug") or d["title"], lambda s: Course.query.filter_by(slug=s).first() is not None),
        description=d.get("description", ""),
        image=d.get("image"),
        price=d.get("price", 0),
        currency=d.get("currency", "EGP"),
        instructor_id=_uid(),  # forced to self — cannot create for another instructor
        category_id=d.get("category_id"),
        duration_minutes=d.get("duration_minutes"),
        status=status,
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(course=c.to_dict()), 201


@bp.patch("/courses/<int:cid>")
@require_role("instructor")
def course_update(cid):
    c = _own_course(cid)
    if not c:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    if "status" in d and d["status"] not in ("draft", "published", "unpublished"):
        return jsonify(error="bad_status"), 422
    for f in ("title", "description", "image", "price", "currency", "category_id", "duration_minutes", "status"):
        if f in d:
            setattr(c, f, d[f])  # instructor_id intentionally not settable
    db.session.commit()
    return jsonify(course=c.to_dict())


@bp.delete("/courses/<int:cid>")
@require_role("instructor")
def course_delete(cid):
    c = _own_course(cid)
    if not c:
        return jsonify(error="not_found"), 404
    db.session.delete(c)
    db.session.commit()
    return jsonify(deleted=cid)


# ------------------------------ modules / lessons ------------------------------

@bp.post("/courses/<int:cid>/modules")
@require_role("instructor")
def module_create(cid):
    if not _own_course(cid):
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    m = CourseModule(course_id=cid, title=d.get("title", "وحدة"), position=d.get("position", 0))
    db.session.add(m)
    db.session.commit()
    return jsonify(module=m.to_dict()), 201


@bp.patch("/modules/<int:mid>")
@require_role("instructor")
def module_update(mid):
    m = _own_module(mid)
    if not m:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    for f in ("title", "position"):
        if f in d:
            setattr(m, f, d[f])
    db.session.commit()
    return jsonify(module=m.to_dict())


@bp.delete("/modules/<int:mid>")
@require_role("instructor")
def module_delete(mid):
    m = _own_module(mid)
    if not m:
        return jsonify(error="not_found"), 404
    db.session.delete(m)
    db.session.commit()
    return jsonify(deleted=mid)


@bp.post("/modules/<int:mid>/lessons")
@require_role("instructor")
def lesson_create(mid):
    if not _own_module(mid):
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    l = Lesson(module_id=mid, title=d.get("title", "درس"), position=d.get("position", 0),
               duration_minutes=d.get("duration_minutes"))
    db.session.add(l)
    db.session.commit()
    return jsonify(lesson=l.to_dict()), 201


@bp.patch("/lessons/<int:lid>")
@require_role("instructor")
def lesson_update(lid):
    l = _own_lesson(lid)
    if not l:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    # video changes are permission-gated (plan §10)
    if "vdocipher_video_id" in d:
        me = _me()
        new_val = d["vdocipher_video_id"]
        if l.vdocipher_video_id and not new_val:
            if not me.can_delete_video:
                return jsonify(error="video_delete_forbidden"), 403
        elif l.vdocipher_video_id and new_val != l.vdocipher_video_id:
            if not me.can_edit_video:
                return jsonify(error="video_edit_forbidden"), 403
        elif not l.vdocipher_video_id and new_val:
            if not me.can_add_video:
                return jsonify(error="video_add_forbidden"), 403
        l.vdocipher_video_id = new_val
    for f in ("title", "position", "duration_minutes", "is_protected"):
        if f in d:
            setattr(l, f, d[f])
    db.session.commit()
    return jsonify(lesson=l.to_dict())


@bp.delete("/lessons/<int:lid>")
@require_role("instructor")
def lesson_delete(lid):
    l = _own_lesson(lid)
    if not l:
        return jsonify(error="not_found"), 404
    db.session.delete(l)
    db.session.commit()
    return jsonify(deleted=lid)


# ------------------------------ students / revenue ------------------------------

@bp.get("/students")
@require_role("instructor")
def students():
    my_course_ids = [c.id for c in Course.query.filter_by(instructor_id=_uid()).all()]
    rows = (
        db.session.query(User, Course.title)
        .join(Enrollment, Enrollment.user_id == User.id)
        .join(Course, Course.id == Enrollment.course_id)
        .filter(Enrollment.course_id.in_(my_course_ids or [0]), Enrollment.status == "active")
        .all()
    )
    return jsonify(students=[{"id": u.id, "name": u.name, "email": u.email, "course": title} for u, title in rows])


@bp.get("/payments")
@require_role("instructor")
def payments():
    my_course_ids = [c.id for c in Course.query.filter_by(instructor_id=_uid()).all()]
    rows = InstapayPayment.query.filter(
        InstapayPayment.course_id.in_(my_course_ids or [0]), InstapayPayment.status == "approved"
    ).order_by(InstapayPayment.reviewed_at.desc()).all()
    return jsonify(payments=[p.to_dict() for p in rows],
                   total=sum(float(p.transfer_amount or 0) for p in rows))


@bp.get("/permissions")
@require_role("instructor")
def my_permissions():
    me = _me()
    return jsonify(can_add_video=me.can_add_video, can_edit_video=me.can_edit_video,
                   can_delete_video=me.can_delete_video)
