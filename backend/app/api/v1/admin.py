import os

from flask import Blueprint, jsonify, request, send_file

from ...extensions import db
from datetime import datetime, timezone

from ...models import (
    User, Category, Course, CourseModule, Lesson, Bundle, Enrollment, InstapayPayment, Payment,
    Setting, Article, ContactMessage, Notification, BaytarianRequest, CourseVideo, LessonProgress,
    VideoEntitlement, bundle_videos, push_notification,
)
from ...models.catalog import ACCESS_TYPES
from ...security import require_role, hash_password
from ...services.catalog_access import (
    CatalogValidationError, validate_bundle_compatibility, validate_catalog_item,
    validate_course_bundle_compatibility, validate_video_bundle_compatibility,
)
from ...utils import slugify
from flask_jwt_extended import get_jwt_identity
from ...services import vdocipher_admin
from ...services.vdocipher_admin import VdoCipherAdminError

bp = Blueprint("admin", __name__)
ROLES = ("student", "instructor", "admin")


def _uid():
    return int(get_jwt_identity())


# ------------------------------ dashboard ------------------------------

@bp.get("/stats")
@require_role("admin")
def stats():
    def n(q):
        return db.session.query(q).count()

    return jsonify(
        users={
            "total": User.query.count(),
            "students": User.query.filter_by(role="student").count(),
            "instructors": User.query.filter_by(role="instructor").count(),
            "admins": User.query.filter_by(role="admin").count(),
        },
        courses={
            "total": Course.query.count(),
            "published": Course.query.filter_by(status="published").count(),
        },
        enrollments=Enrollment.query.filter_by(status="active").count(),
        payments={
            "paid": Payment.query.filter_by(status="paid").count(),
            "revenue": float(db.session.query(db.func.coalesce(db.func.sum(Payment.amount), 0))
                             .filter(Payment.status == "paid").scalar() or 0),
        },
        baytarian={"pending": BaytarianRequest.query.filter_by(status="pending").count()},
    )


# ------------------------------ users ------------------------------

def _user_json(u):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "is_active": u.is_active, "is_baytarian": u.is_baytarian,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "headline": u.headline, "bio": u.bio, "avatar_url": u.avatar_url, "expertise": u.expertise or [],
            "can_add_video": u.can_add_video, "can_edit_video": u.can_edit_video, "can_delete_video": u.can_delete_video}


@bp.get("/users")
@require_role("admin")
def users_list():
    q = User.query
    role = request.args.get("role")
    if role:
        q = q.filter_by(role=role)
    search = request.args.get("q")
    if search:
        like = f"%{search}%"
        q = q.filter(db.or_(User.name.ilike(like), User.email.ilike(like)))
    page = max(request.args.get("page", 1, type=int), 1)
    pg = db.paginate(q.order_by(User.created_at.desc()), page=page, per_page=20, error_out=False)
    return jsonify(users=[_user_json(u) for u in pg.items], total=pg.total, page=pg.page, pages=pg.pages)


@bp.post("/users")
@require_role("admin")
def users_create():
    d = request.get_json() or {}
    for f in ("name", "email", "password"):
        if not d.get(f):
            return jsonify(error=f"{f}_required"), 422
    if d.get("role", "student") not in ROLES:
        return jsonify(error="bad_role"), 422
    email = d["email"].lower()
    if User.query.filter_by(email=email).first():
        return jsonify(error="email_taken"), 409
    u = User(name=d["name"], email=email, password_hash=hash_password(d["password"]),
             role=d.get("role", "student"))
    db.session.add(u)
    db.session.commit()
    return jsonify(user=_user_json(u)), 201


@bp.patch("/users/<int:uid>")
@require_role("admin")
def users_update(uid):
    u = db.session.get(User, uid)
    if not u:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    if "role" in d:
        if d["role"] not in ROLES:
            return jsonify(error="bad_role"), 422
        if u.id == _uid() and d["role"] != "admin":
            return jsonify(error="cannot_demote_self"), 409
        u.role = d["role"]
    if "name" in d:
        u.name = d["name"]
    if "is_active" in d:
        if u.id == _uid() and not d["is_active"]:
            return jsonify(error="cannot_disable_self"), 409
        u.is_active = bool(d["is_active"])
    if d.get("password"):
        u.password_hash = hash_password(d["password"])
    for f in ("headline", "bio", "avatar_url", "expertise", "is_baytarian",
              "can_add_video", "can_edit_video", "can_delete_video"):
        if f in d:
            setattr(u, f, d[f])
    db.session.commit()
    return jsonify(user=_user_json(u))


@bp.delete("/users/<int:uid>")
@require_role("admin")
def users_delete(uid):
    u = db.session.get(User, uid)
    if not u:
        return jsonify(error="not_found"), 404
    if u.id == _uid():
        return jsonify(error="cannot_delete_self"), 409
    # instructors owning courses must have them reassigned/deleted first (FK is NOT NULL)
    if Course.query.filter_by(instructor_id=uid).count():
        return jsonify(error="user_has_courses"), 409
    # clear/cascade the user's dependent rows so the delete doesn't hit FK constraints
    for e in Enrollment.query.filter_by(user_id=uid).all():
        db.session.delete(e)  # cascades lesson_progress
    InstapayPayment.query.filter_by(user_id=uid).delete()
    InstapayPayment.query.filter_by(reviewed_by=uid).update({"reviewed_by": None})
    Payment.query.filter_by(user_id=uid).delete()
    Article.query.filter_by(author_id=uid).update({"author_id": None})
    Notification.query.filter_by(user_id=uid).delete()
    db.session.delete(u)
    db.session.commit()
    return jsonify(deleted=uid)


# ------------------------------ categories ------------------------------

@bp.post("/categories")
@require_role("admin")
def category_create():
    d = request.get_json() or {}
    if not d.get("name"):
        return jsonify(error="name_required"), 422
    c = Category(name=d["name"], name_en=d.get("name_en"),
                 slug=slugify(d.get("slug") or d["name"],
                              lambda s: Category.query.filter_by(slug=s).first() is not None))
    db.session.add(c)
    db.session.commit()
    return jsonify(category=c.to_dict()), 201


@bp.patch("/categories/<int:cid>")
@require_role("admin")
def category_update(cid):
    c = db.session.get(Category, cid)
    if not c:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    for f in ("name", "name_en"):
        if f in d:
            setattr(c, f, d[f])
    db.session.commit()
    return jsonify(category=c.to_dict())


@bp.delete("/categories/<int:cid>")
@require_role("admin")
def category_delete(cid):
    c = db.session.get(Category, cid)
    if not c:
        return jsonify(error="not_found"), 404
    if c.is_fixed:
        return jsonify(error="fixed_category"), 409
    if Course.query.filter_by(category_id=cid).count() or Lesson.query.filter_by(category_id=cid).count():
        return jsonify(error="category_in_use"), 409
    db.session.delete(c)
    db.session.commit()
    return jsonify(deleted=cid)


# ------------------------------ courses ------------------------------

@bp.get("/courses")
@require_role("admin")
def courses_list():
    q = Course.query
    status = request.args.get("status")
    if status:
        q = q.filter_by(status=status)
    iid = request.args.get("instructor_id", type=int)
    if iid:
        q = q.filter_by(instructor_id=iid)
    search = request.args.get("q")
    if search:
        q = q.filter(Course.title.ilike(f"%{search}%"))
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 20, type=int), 1), 100)
    pg = db.paginate(q.order_by(Course.created_at.desc()), page=page, per_page=per_page, error_out=False)
    return jsonify(courses=[c.to_dict() for c in pg.items], total=pg.total, page=pg.page, pages=pg.pages)


@bp.get("/courses/<int:cid>")
@require_role("admin")
def course_get(cid):
    c = db.session.get(Course, cid)
    if not c:
        return jsonify(error="not_found"), 404
    return jsonify(course=c.to_dict(with_content=True))


@bp.post("/courses")
@require_role("admin")
def course_create():
    d = request.get_json() or {}
    if not d.get("title"):
        return jsonify(error="title_required"), 422
    instr_id = d.get("instructor_id")
    if not instr_id or not User.query.filter_by(id=instr_id, role="instructor").first():
        return jsonify(error="valid_instructor_required"), 422
    status = d.get("status", "draft")
    if status not in ("draft", "published", "unpublished"):
        return jsonify(error="bad_status"), 422
    try:
        catalog = validate_catalog_item({
            "status": status,
            "access_type": d.get("access_type", "general"),
            "price": d.get("price", 0),
            "currency": d.get("currency", "EGP"),
            "category_id": d.get("category_id"),
            "access_days": d.get("access_days"),
        })
    except CatalogValidationError as exc:
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    c = Course(
        title=d["title"],
        title_en=d.get("title_en"),
        slug=slugify(d.get("slug") or d["title"], lambda s: Course.query.filter_by(slug=s).first() is not None),
        description=d.get("description", ""),
        description_en=d.get("description_en"),
        image=d.get("image"),
        price=catalog["price"],
        currency=catalog["currency"],
        instructor_id=instr_id,
        category_id=catalog["category_id"],
        duration_minutes=d.get("duration_minutes"),
        access_days=catalog["access_days"],
        access_type=catalog["access_type"],
        status=catalog["status"],
    )
    db.session.add(c)
    db.session.commit()
    return jsonify(course=c.to_dict()), 201


@bp.patch("/courses/<int:cid>")
@require_role("admin")
def course_update(cid):
    c = db.session.get(Course, cid)
    if not c:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    if "status" in d and d["status"] not in ("draft", "published", "unpublished"):
        return jsonify(error="bad_status"), 422
    if "instructor_id" in d and not User.query.filter_by(id=d["instructor_id"], role="instructor").first():
        return jsonify(error="valid_instructor_required"), 422
    try:
        catalog = validate_catalog_item({
            key: d[key] for key in ("status", "access_type", "price", "currency", "category_id", "access_days") if key in d
        }, current=c)
        validate_course_bundle_compatibility(c, catalog["access_type"])
    except CatalogValidationError as exc:
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    for f in ("title", "title_en", "description", "description_en", "image", "price", "currency",
              "instructor_id", "category_id", "duration_minutes", "access_days", "access_type", "status"):
        if f in d or f in ("price", "currency", "category_id", "access_days", "access_type", "status"):
            setattr(c, f, catalog[f] if f in catalog else d[f])
    db.session.commit()
    return jsonify(course=c.to_dict())


@bp.delete("/courses/<int:cid>")
@require_role("admin")
def course_delete(cid):
    c = db.session.get(Course, cid)
    if not c:
        return jsonify(error="not_found"), 404
    db.session.delete(c)  # modules/lessons cascade
    db.session.commit()
    return jsonify(deleted=cid)


# ------------------------------ modules ------------------------------

@bp.post("/courses/<int:cid>/modules")
@require_role("admin")
def module_create(cid):
    if not db.session.get(Course, cid):
        return jsonify(error="course_not_found"), 404
    d = request.get_json() or {}
    m = CourseModule(course_id=cid, title=d.get("title", "وحدة"), title_en=d.get("title_en"),
                     position=d.get("position", 0))
    db.session.add(m)
    db.session.commit()
    return jsonify(module=m.to_dict()), 201


@bp.patch("/modules/<int:mid>")
@require_role("admin")
def module_update(mid):
    m = db.session.get(CourseModule, mid)
    if not m:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    for f in ("title", "title_en", "position"):
        if f in d:
            setattr(m, f, d[f])
    db.session.commit()
    return jsonify(module=m.to_dict())


@bp.delete("/modules/<int:mid>")
@require_role("admin")
def module_delete(mid):
    m = db.session.get(CourseModule, mid)
    if not m:
        return jsonify(error="not_found"), 404
    db.session.delete(m)
    db.session.commit()
    return jsonify(deleted=mid)


# ------------------------------ lessons ------------------------------

@bp.post("/modules/<int:mid>/lessons")
@require_role("admin")
def lesson_create(mid):
    if not db.session.get(CourseModule, mid):
        return jsonify(error="module_not_found"), 404
    d = request.get_json() or {}
    _m = db.session.get(CourseModule, mid)
    l = Lesson(
        module_id=mid,
        course_id=_m.course_id if _m else None,  # keep the direct-course link consistent
        title=d.get("title", "درس"),
        title_en=d.get("title_en"),
        position=d.get("position", 0),
        duration_minutes=d.get("duration_minutes"),
        vdocipher_video_id=d.get("vdocipher_video_id"),
        is_protected=d.get("is_protected", True),
    )
    db.session.add(l)
    db.session.commit()
    return jsonify(lesson=l.to_dict()), 201


@bp.patch("/lessons/<int:lid>")
@require_role("admin")
def lesson_update(lid):
    l = db.session.get(Lesson, lid)
    if not l:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    for f in ("title", "title_en", "position", "duration_minutes", "vdocipher_video_id", "is_protected"):
        if f in d:
            setattr(l, f, d[f])
    db.session.commit()
    return jsonify(lesson=l.to_dict())


@bp.delete("/lessons/<int:lid>")
@require_role("admin")
def lesson_delete(lid):
    return _delete_catalog_video(lid)


# ------------------------------ baytarian verification ------------------------------

@bp.get("/baytarian-requests")
@require_role("admin")
def baytarian_list():
    q = BaytarianRequest.query
    status = request.args.get("status")
    if status:
        q = q.filter_by(status=status)
    rows = q.order_by(BaytarianRequest.created_at.desc()).all()
    return jsonify(requests=[r.to_dict(admin=True) for r in rows],
                   pending=BaytarianRequest.query.filter_by(status="pending").count())


@bp.get("/baytarian-requests/<int:rid>/doc/<int:idx>")
@require_role("admin")
def baytarian_doc(rid, idx):
    r = db.session.get(BaytarianRequest, rid)
    docs = (r.documents or []) if r else []
    if not r or idx < 0 or idx >= len(docs) or not os.path.exists(docs[idx]):
        return jsonify(error="not_found"), 404
    return send_file(os.path.abspath(docs[idx]))


@bp.post("/baytarian-requests/<int:rid>/approve")
@require_role("admin")
def baytarian_approve(rid):
    r = db.session.get(BaytarianRequest, rid)
    if not r:
        return jsonify(error="not_found"), 404
    if r.status != "pending":
        return jsonify(error="not_pending", status=r.status), 409
    try:
        r.status = "approved"
        r.reviewed_by = _uid()
        r.reviewed_at = datetime.now(timezone.utc)
        user = db.session.get(User, r.user_id)
        user.is_baytarian = True
        push_notification(r.user_id, "baytarian_approved", "تم توثيق حسابك كطبيب بيطري ✅",
                          "أصبح بإمكانك الآن الوصول إلى محتوى «بيطريّ» المخصّص للأطباء.")
        db.session.commit()
    except Exception:  # noqa: BLE001
        db.session.rollback()
        raise
    return jsonify(request=r.to_dict(admin=True))


@bp.post("/baytarian-requests/<int:rid>/reject")
@require_role("admin")
def baytarian_reject(rid):
    r = db.session.get(BaytarianRequest, rid)
    if not r:
        return jsonify(error="not_found"), 404
    if r.status != "pending":
        return jsonify(error="not_pending", status=r.status), 409
    r.status = "rejected"
    r.reject_reason = (request.get_json() or {}).get("reason")
    r.reviewed_by = _uid()
    r.reviewed_at = datetime.now(timezone.utc)
    push_notification(r.user_id, "baytarian_rejected", "لم يُقبل طلب التوثيق",
                      r.reject_reason or "يرجى مراجعة المستندات وإعادة الإرسال.")
    db.session.commit()
    return jsonify(request=r.to_dict(admin=True))


# ------------------------------ bundles ------------------------------

def _bundle_catalog_fields(data, current=None):
    if "criteria" in data:
        raise CatalogValidationError(["unsupported_criteria"])
    base = {
        "status": current.status if current else "draft",
        "access_type": current.access_type if current else "general",
        "price": current.price if current else 0,
        "currency": current.currency if current else "EGP",
        "access_days": current.access_days if current else None,
        # Packages have no category of their own. This sentinel lets them share
        # the rest of the catalog validator without weakening publication rules.
        "category_id": True,
    }
    base.update({
        key: data[key]
        for key in ("status", "access_type", "price", "currency", "access_days")
        if key in data
    })
    return validate_catalog_item(base)


def _bundle_ids(data, key, model, missing_error):
    values = data.get(key)
    if not isinstance(values, list) or any(
        not isinstance(value, int) or isinstance(value, bool) for value in values
    ):
        raise CatalogValidationError([f"invalid_{key}"])
    wanted = list(dict.fromkeys(values))
    rows = model.query.filter(model.id.in_(wanted)).all() if wanted else []
    by_id = {row.id: row for row in rows}
    if len(by_id) != len(wanted):
        raise CatalogValidationError([missing_error])
    return [by_id[value] for value in wanted]


def _bundle_contents(data, current=None):
    courses = list(current.courses) if current else []
    videos = list(current.videos) if current else []
    if "course_ids" in data:
        courses = _bundle_ids(data, "course_ids", Course, "course_not_found")
    if "video_ids" in data:
        videos = _bundle_ids(data, "video_ids", Lesson, "video_not_found")
    return courses, videos


def _bundle_input(data, current=None):
    catalog = _bundle_catalog_fields(data, current=current)
    courses, videos = _bundle_contents(data, current=current)
    validate_bundle_compatibility(catalog["access_type"], courses, videos)
    return catalog, courses, videos


@bp.get("/bundles")
@require_role("admin")
def bundles_list():
    rows = Bundle.query.order_by(Bundle.created_at.desc()).all()
    return jsonify(bundles=[b.to_dict() for b in rows])


@bp.get("/bundles/<int:bid>")
@require_role("admin")
def bundle_get(bid):
    b = db.session.get(Bundle, bid)
    if not b:
        return jsonify(error="not_found"), 404
    return jsonify(bundle=b.to_dict())


@bp.post("/bundles")
@require_role("admin")
def bundle_create():
    d = request.get_json() or {}
    if not d.get("title"):
        return jsonify(error="title_required"), 422
    status = d.get("status", "draft")
    if status not in ("draft", "published", "unpublished"):
        return jsonify(error="bad_status"), 422
    try:
        catalog, courses, videos = _bundle_input(d)
    except CatalogValidationError as exc:
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    b = Bundle(
        title=d["title"], title_en=d.get("title_en"),
        slug=slugify(d.get("slug") or d["title"], lambda s: Bundle.query.filter_by(slug=s).first() is not None),
        description=d.get("description", ""), description_en=d.get("description_en"),
        image=d.get("image"), price=catalog["price"], currency=catalog["currency"],
        access_days=catalog["access_days"], access_type=catalog["access_type"], status=catalog["status"],
        courses=courses, videos=videos,
    )
    db.session.add(b)
    db.session.commit()
    return jsonify(bundle=b.to_dict()), 201


@bp.patch("/bundles/<int:bid>")
@require_role("admin")
def bundle_update(bid):
    b = db.session.get(Bundle, bid)
    if not b:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    if "status" in d and d["status"] not in ("draft", "published", "unpublished"):
        return jsonify(error="bad_status"), 422
    try:
        catalog, courses, videos = _bundle_input(d, current=b)
    except CatalogValidationError as exc:
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    for f in ("title", "title_en", "description", "description_en", "image"):
        if f in d:
            setattr(b, f, d[f])
    for f in ("price", "currency", "access_days", "access_type", "status"):
        setattr(b, f, catalog[f])
    b.courses = courses
    b.videos = videos
    db.session.commit()
    return jsonify(bundle=b.to_dict())


@bp.delete("/bundles/<int:bid>")
@require_role("admin")
def bundle_delete(bid):
    b = db.session.get(Bundle, bid)
    if not b:
        return jsonify(error="not_found"), 404
    db.session.delete(b)
    db.session.commit()
    return jsonify(deleted=bid)


# ------------------------------ video catalog ------------------------------

def _video_dict(l):
    d = l.to_dict()
    d["title_en"] = l.title_en
    d["vdocipher_video_id"] = l.vdocipher_video_id
    d["courses"] = [
        {"id": row.course.id, "title": row.course.title, "position": row.position}
        for row in l.course_assignments
    ]
    return d


def _delete_catalog_video(video_id):
    video = db.session.get(Lesson, video_id)
    if not video:
        return jsonify(error="not_found"), 404
    has_dependencies = (
        video.course_id is not None
        or video.module_id is not None
        or CourseVideo.query.filter_by(video_id=video_id).count()
        or db.session.query(bundle_videos.c.bundle_id).filter(bundle_videos.c.video_id == video_id).count()
        or Payment.query.filter_by(video_id=video_id).count()
        or VideoEntitlement.query.filter_by(video_id=video_id).count()
        or LessonProgress.query.filter_by(lesson_id=video_id).count()
    )
    if has_dependencies:
        return jsonify(error="video_in_use"), 409
    db.session.delete(video)
    db.session.commit()
    return jsonify(deleted=video_id)


def _catalog_video_fields(data, current=None):
    if "criteria" in data:
        return None, (jsonify(error="catalog_validation_failed", errors=["unsupported_criteria"]), 422)
    try:
        catalog = validate_catalog_item({
            "status": data.get("status", "draft"),
            "access_type": data.get("access_type", "free"),
            "price": data.get("price", 0),
            "currency": data.get("currency", "EGP"),
            "category_id": data.get("category_id"),
            "access_days": data.get("access_days"),
        } if current is None else {
            key: data[key]
            for key in ("status", "access_type", "price", "currency", "category_id", "access_days")
            if key in data
        }, current=current)
    except CatalogValidationError as exc:
        return None, (jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422)
    if catalog["category_id"] is not None and not db.session.get(Category, catalog["category_id"]):
        return None, (jsonify(error="catalog_validation_failed", errors=["invalid_category"]), 422)
    return catalog, None


def set_video_courses(video, course_ids):
    if not isinstance(course_ids, list):
        raise CatalogValidationError(["invalid_course_ids"])
    wanted = set(course_ids or [])
    if not all(isinstance(course_id, int) and not isinstance(course_id, bool) for course_id in wanted):
        raise CatalogValidationError(["invalid_course_ids"])
    courses = Course.query.filter(Course.id.in_(wanted)).all() if wanted else []
    if len(courses) != len(wanted):
        raise CatalogValidationError(["course_not_found"])
    validate_video_bundle_compatibility(
        video, standalone=not wanted and not video.course_id and not video.module_id,
    )
    existing = {row.course_id: row for row in video.course_assignments}
    for course_id, row in existing.items():
        if course_id not in wanted:
            db.session.delete(row)
    for course in courses:
        if course.id not in existing:
            last = CourseVideo.query.filter_by(course_id=course.id).order_by(CourseVideo.position.desc()).first()
            db.session.add(CourseVideo(
                course_id=course.id, video_id=video.id, position=(last.position + 1 if last else 0),
            ))


def add_video_courses(video, course_ids):
    if not isinstance(course_ids, list):
        raise CatalogValidationError(["invalid_course_ids"])
    wanted = set(course_ids)
    if not all(isinstance(course_id, int) and not isinstance(course_id, bool) for course_id in wanted):
        raise CatalogValidationError(["invalid_course_ids"])
    existing = {row.course_id for row in video.course_assignments}
    set_video_courses(video, sorted(existing | wanted))


def reorder_course_videos(course, video_ids):
    if not isinstance(video_ids, list) or any(not isinstance(video_id, int) or isinstance(video_id, bool) for video_id in video_ids):
        raise CatalogValidationError(["invalid_video_ids"])
    rows = {row.video_id: row for row in course.video_assignments}
    if len(video_ids) != len(rows) or set(rows) != set(video_ids):
        raise CatalogValidationError(["video_order_membership_mismatch"])
    for position, video_id in enumerate(video_ids):
        rows[video_id].position = position


@bp.get("/videos")
@require_role("admin")
def videos_list():
    """Paginated canonical catalog videos with optional metadata/assignment filters."""
    q = Lesson.query
    cid = request.args.get("course_id", type=int)
    if cid:
        q = q.outerjoin(CourseModule, Lesson.module_id == CourseModule.id).outerjoin(
            CourseVideo, CourseVideo.video_id == Lesson.id,
        ).filter(db.or_(
            Lesson.course_id == cid,
            CourseModule.course_id == cid,
            CourseVideo.course_id == cid,
        )).distinct()
    elif request.args.get("standalone") == "1":
        q = q.outerjoin(CourseVideo, CourseVideo.video_id == Lesson.id).filter(
            CourseVideo.id.is_(None), Lesson.course_id.is_(None), Lesson.module_id.is_(None),
        )
    if request.args.get("status"):
        q = q.filter(Lesson.status == request.args["status"])
    if request.args.get("category_id", type=int):
        q = q.filter(Lesson.category_id == request.args.get("category_id", type=int))
    if request.args.get("access_type"):
        q = q.filter(Lesson.access_type == request.args["access_type"])
    if request.args.get("q"):
        like = f"%{request.args['q']}%"
        q = q.filter(db.or_(Lesson.title.ilike(like), Lesson.title_en.ilike(like), Lesson.vdocipher_video_id.ilike(like)))
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 20, type=int), 1), 100)
    pg = db.paginate(q.order_by(Lesson.created_at.desc(), Lesson.id.desc()), page=page, per_page=per_page, error_out=False)
    return jsonify(items=[_video_dict(l) for l in pg.items], total=pg.total, page=pg.page)


@bp.get("/videos/<int:vid>")
@require_role("admin")
def video_get(vid):
    l = db.session.get(Lesson, vid)
    if not l:
        return jsonify(error="not_found"), 404
    return jsonify(video=_video_dict(l))


@bp.post("/videos")
@require_role("admin")
def video_create():
    d = request.get_json() or {}
    if not d.get("title"):
        return jsonify(error="title_required"), 422
    catalog, error = _catalog_video_fields(d)
    if error:
        return error
    provider_id = d.get("vdocipher_video_id") or None
    if provider_id and Lesson.query.filter_by(vdocipher_video_id=provider_id).first():
        return jsonify(error="duplicate_video"), 409
    course_ids = d.get("course_ids")
    if course_ids is None:
        course_ids = [d["course_id"]] if d.get("course_id") else []
    l = Lesson(
        course_id=None, module_id=None,
        title=d["title"], title_en=d.get("title_en"),
        description=d.get("description", ""),
        category_id=catalog["category_id"], price=catalog["price"], currency=catalog["currency"],
        access_days=catalog["access_days"], access_type=catalog["access_type"], status=catalog["status"],
        duration_minutes=d.get("duration_minutes"),
        vdocipher_video_id=provider_id,
        is_protected=d.get("is_protected", True),
    )
    db.session.add(l)
    db.session.flush()
    try:
        set_video_courses(l, course_ids)
    except CatalogValidationError as exc:
        db.session.rollback()
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    db.session.commit()
    return jsonify(video=_video_dict(l)), 201


@bp.patch("/videos/<int:vid>")
@require_role("admin")
def video_update(vid):
    l = db.session.get(Lesson, vid)
    if not l:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    catalog, error = _catalog_video_fields(d, current=l)
    if error:
        return error
    try:
        validate_video_bundle_compatibility(l, access_type=catalog["access_type"])
    except CatalogValidationError as exc:
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    if "vdocipher_video_id" in d:
        provider_id = d["vdocipher_video_id"] or None
        duplicate = Lesson.query.filter(Lesson.vdocipher_video_id == provider_id, Lesson.id != l.id).first() if provider_id else None
        if duplicate:
            return jsonify(error="duplicate_video"), 409
    for f in ("title", "title_en", "description", "duration_minutes", "vdocipher_video_id", "is_protected"):
        if f in d:
            setattr(l, f, (d[f] or None) if f == "vdocipher_video_id" else d[f])
    for f in ("price", "currency", "category_id", "access_days", "access_type", "status"):
        setattr(l, f, catalog[f])
    course_ids = d.get("course_ids")
    if course_ids is None and "course_id" in d:
        course_ids = [d["course_id"]] if d["course_id"] else []
    if course_ids is not None:
        try:
            set_video_courses(l, course_ids)
        except CatalogValidationError as exc:
            db.session.rollback()
            return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    db.session.commit()
    return jsonify(video=_video_dict(l))


@bp.delete("/videos/<int:vid>")
@require_role("admin")
def video_delete(vid):
    return _delete_catalog_video(vid)


@bp.post("/videos/<int:vid>/courses")
@require_role("admin")
def video_courses_set(vid):
    l = db.session.get(Lesson, vid)
    if not l:
        return jsonify(error="not_found"), 404
    course_ids = (request.get_json() or {}).get("course_ids")
    if not isinstance(course_ids, list):
        return jsonify(error="catalog_validation_failed", errors=["invalid_course_ids"]), 422
    try:
        set_video_courses(l, course_ids)
    except CatalogValidationError as exc:
        db.session.rollback()
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    db.session.commit()
    return jsonify(video=_video_dict(l))


@bp.delete("/videos/<int:vid>/courses/<int:cid>")
@require_role("admin")
def video_course_delete(vid, cid):
    row = CourseVideo.query.filter_by(video_id=vid, course_id=cid).first()
    if not row:
        return jsonify(error="not_found"), 404
    db.session.delete(row)
    db.session.commit()
    l = db.session.get(Lesson, vid)
    return jsonify(video=_video_dict(l))


@bp.put("/courses/<int:cid>/videos/order")
@require_role("admin")
def course_videos_order(cid):
    course = db.session.get(Course, cid)
    if not course:
        return jsonify(error="course_not_found"), 404
    video_ids = (request.get_json() or {}).get("video_ids")
    try:
        reorder_course_videos(course, video_ids)
    except CatalogValidationError as exc:
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    db.session.commit()
    return jsonify(ok=True, count=len(video_ids))


@bp.post("/courses/<int:cid>/videos/reorder")
@require_role("admin")
def videos_reorder(cid):
    """Compatibility alias for deployed clients using the old ``order`` body key."""
    course = db.session.get(Course, cid)
    if not course:
        return jsonify(error="course_not_found"), 404
    order = (request.get_json() or {}).get("order")
    try:
        reorder_course_videos(course, order)
    except CatalogValidationError as exc:
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    db.session.commit()
    return jsonify(ok=True, count=len(order))


# ------------------------------ vdocipher admin ------------------------------

def _vdocipher_error(e):
    code = str(e)
    statuses = {
        "vdocipher_not_found": 404,
        "vdocipher_rate_limited": 429,
        "vdocipher_invalid_folder": 422,
        "vdocipher_invalid_video": 422,
    }
    return jsonify(error=code), statuses.get(code, 503)


@bp.post("/vdocipher/test")
@require_role("admin")
def vdocipher_test():
    try:
        vdocipher_admin.list_videos(limit=1, refresh=True)
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)
    return jsonify(ok=True, configured=vdocipher_admin.configured())


@bp.post("/vdocipher/sync-folders")
@require_role("admin")
def vdocipher_sync_folders():
    try:
        folders = vdocipher_admin.ensure_platform_folders(bool((request.get_json() or {}).get("all_courses")))
        db.session.commit()
    except VdoCipherAdminError as e:
        db.session.rollback()
        return _vdocipher_error(e)
    return jsonify(ok=True, folders=folders)


@bp.get("/vdocipher/videos")
@require_role("admin")
def vdocipher_videos():
    try:
        data = vdocipher_admin.list_videos(
            q=request.args.get("q"),
            folder_id=request.args.get("folder_id"),
            page=request.args.get("page", 1, type=int),
            limit=request.args.get("limit", 20, type=int),
            refresh=request.args.get("refresh") == "1",
        )
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)
    return jsonify(data)


@bp.get("/vdocipher/folders/<folder_id>")
@require_role("admin")
def vdocipher_folder(folder_id):
    try:
        return jsonify(vdocipher_admin.list_folder(folder_id, refresh=request.args.get("refresh") == "1"))
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)


@bp.post("/vdocipher/folders")
@require_role("admin")
def vdocipher_folder_create():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify(error="name_required"), 422
    try:
        folder = vdocipher_admin.create_folder(name, data.get("parent_id") or "root")
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)
    return jsonify(folder=folder), 201


@bp.patch("/vdocipher/folders/<folder_id>")
@require_role("admin")
def vdocipher_folder_rename(folder_id):
    name = ((request.get_json() or {}).get("name") or "").strip()
    if not name:
        return jsonify(error="name_required"), 422
    try:
        return jsonify(vdocipher_admin.rename_folder(folder_id, name))
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)


@bp.post("/vdocipher/move")
@require_role("admin")
def vdocipher_move():
    data = request.get_json() or {}
    video_ids = data.get("video_ids")
    folder_ids = data.get("folder_ids")
    if not data.get("folder_id") or not isinstance(video_ids, list) or not isinstance(folder_ids, list):
        return jsonify(error="move_items_required"), 422
    if not video_ids and not folder_ids:
        return jsonify(error="move_items_required"), 422
    try:
        return jsonify(vdocipher_admin.move_items(data["folder_id"], video_ids, folder_ids))
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)


@bp.delete("/vdocipher/folders/<folder_id>")
@require_role("admin")
def vdocipher_folder_delete(folder_id):
    try:
        return jsonify(vdocipher_admin.delete_folder(folder_id))
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)


@bp.get("/vdocipher/videos/<video_id>")
@require_role("admin")
def vdocipher_video_get(video_id):
    try:
        return jsonify(video=vdocipher_admin.get_video(video_id))
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)


@bp.patch("/vdocipher/videos/<video_id>")
@require_role("admin")
def vdocipher_video_update(video_id):
    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify(error="title_required"), 422
    if "description" not in data or not isinstance(data["description"], str):
        return jsonify(error="description_required"), 422
    try:
        return jsonify(vdocipher_admin.update_video(video_id, title, data["description"]))
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)


@bp.post("/vdocipher/videos/<video_id>/preview")
@require_role("admin")
def vdocipher_video_preview(video_id):
    try:
        return jsonify(vdocipher_admin.preview(video_id))
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)


@bp.post("/vdocipher/upload-credentials")
@require_role("admin")
def vdocipher_upload_credentials():
    d = request.get_json() or {}
    title = (d.get("title") or "").strip()
    if not title:
        return jsonify(error="title_required"), 422
    cid = d.get("course_id")
    course = db.session.get(Course, cid) if cid else None
    if cid and not course:
        return jsonify(error="course_not_found"), 404
    try:
        if "folder_id" in d:
            folder_id = d["folder_id"]
        elif course:
            folder_id = vdocipher_admin.ensure_course_folder(course)
        else:
            folder_id = vdocipher_admin.ensure_platform_folders(False)["standalone"]
        result = vdocipher_admin.create_upload(title, folder_id)
        db.session.commit()
    except VdoCipherAdminError as e:
        db.session.rollback()
        return _vdocipher_error(e)
    return jsonify(result)


@bp.post("/vdocipher/import")
@require_role("admin")
def vdocipher_import():
    d = request.get_json() or {}
    if not d.get("video_id"):
        return jsonify(error="video_id_required"), 422
    try:
        d["video_id"] = vdocipher_admin.validate_video_id(d["video_id"])
    except VdoCipherAdminError as e:
        return _vdocipher_error(e)
    course_ids = d.get("course_ids")
    if course_ids is None:
        course_ids = [d["course_id"]] if d.get("course_id") else []
    if not isinstance(course_ids, list) or any(
        not isinstance(course_id, int) or isinstance(course_id, bool) for course_id in course_ids
    ):
        return jsonify(error="catalog_validation_failed", errors=["invalid_course_ids"]), 422
    existing = Lesson.query.filter_by(vdocipher_video_id=d["video_id"]).first()
    catalog, error = _catalog_video_fields(d, current=existing)
    if error:
        return error
    if existing:
        try:
            validate_video_bundle_compatibility(existing, access_type=catalog["access_type"])
            for field in ("category_id", "price", "currency", "access_days", "access_type", "status"):
                setattr(existing, field, catalog[field])
            add_video_courses(existing, course_ids)
        except CatalogValidationError as exc:
            db.session.rollback()
            return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
        db.session.commit()
        return jsonify(video=_video_dict(existing), reused=True)
    try:
        for course_id in course_ids:
            course = db.session.get(Course, course_id)
            if not course:
                raise CatalogValidationError(["course_not_found"])
            vdocipher_admin.ensure_course_folder(course)
        if not course_ids and not db.session.get(Setting, "vdocipher_standalone_folder_id"):
            vdocipher_admin.ensure_platform_folders(False)
    except CatalogValidationError as exc:
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    except VdoCipherAdminError as e:
        db.session.rollback()
        return _vdocipher_error(e)
    l = Lesson(
        course_id=None,
        module_id=None,
        title=d.get("title") or d["video_id"],
        title_en=d.get("title_en"),
        description=d.get("description", ""),
        category_id=catalog["category_id"], price=catalog["price"], currency=catalog["currency"],
        access_days=catalog["access_days"], access_type=catalog["access_type"], status=catalog["status"],
        duration_minutes=d.get("duration_minutes"),
        vdocipher_video_id=d["video_id"],
        is_protected=True,
    )
    db.session.add(l)
    db.session.flush()
    try:
        set_video_courses(l, course_ids)
    except CatalogValidationError as exc:
        db.session.rollback()
        return jsonify(error="catalog_validation_failed", errors=list(exc.errors)), 422
    db.session.commit()
    return jsonify(video=_video_dict(l)), 201


# ------------------------------ site settings ------------------------------

@bp.get("/settings")
@require_role("admin")
def settings_get():
    return jsonify(settings={s.key: s.value for s in Setting.query.all()})


@bp.put("/settings")
@require_role("admin")
def settings_put():
    """Bulk upsert: body is a flat {key: value} map."""
    data = request.get_json() or {}
    if not isinstance(data, dict):
        return jsonify(error="object_required"), 422
    for key, value in data.items():
        s = db.session.get(Setting, key)
        if s:
            s.value = value
        else:
            db.session.add(Setting(key=key, value=value))
    db.session.commit()
    return jsonify(settings={s.key: s.value for s in Setting.query.all()})


# ------------------------------ articles (blog + free content) ------------------------------

@bp.get("/articles")
@require_role("admin")
def articles_list():
    q = Article.query
    if request.args.get("type") in ("blog", "content"):
        q = q.filter_by(type=request.args["type"])
    if request.args.get("status") in ("draft", "published"):
        q = q.filter_by(status=request.args["status"])
    page = max(request.args.get("page", 1, type=int), 1)
    pg = db.paginate(q.order_by(Article.created_at.desc()), page=page, per_page=20, error_out=False)
    return jsonify(articles=[a.to_dict() for a in pg.items], total=pg.total, page=pg.page, pages=pg.pages)


@bp.get("/articles/<int:aid>")
@require_role("admin")
def article_get(aid):
    a = db.session.get(Article, aid)
    if not a:
        return jsonify(error="not_found"), 404
    return jsonify(article=a.to_dict(full=True))


@bp.post("/articles")
@require_role("admin")
def article_create():
    d = request.get_json() or {}
    if not d.get("title"):
        return jsonify(error="title_required"), 422
    atype = d.get("type", "blog")
    if atype not in ("blog", "content"):
        return jsonify(error="bad_type"), 422
    status = d.get("status", "draft")
    a = Article(
        type=atype,
        title=d["title"],
        title_en=d.get("title_en"),
        slug=slugify(d.get("slug") or d["title"], lambda s: Article.query.filter_by(slug=s).first() is not None),
        excerpt=d.get("excerpt"),
        excerpt_en=d.get("excerpt_en"),
        body=d.get("body", ""),
        body_en=d.get("body_en"),
        cover=d.get("cover"),
        status=status if status in ("draft", "published") else "draft",
        author_id=_uid(),
        published_at=datetime.now(timezone.utc) if status == "published" else None,
    )
    db.session.add(a)
    db.session.commit()
    return jsonify(article=a.to_dict(full=True)), 201


@bp.patch("/articles/<int:aid>")
@require_role("admin")
def article_update(aid):
    a = db.session.get(Article, aid)
    if not a:
        return jsonify(error="not_found"), 404
    d = request.get_json() or {}
    if "status" in d:
        if d["status"] not in ("draft", "published"):
            return jsonify(error="bad_status"), 422
        if d["status"] == "published" and not a.published_at:
            a.published_at = datetime.now(timezone.utc)
    for f in ("type", "title", "title_en", "excerpt", "excerpt_en", "body", "body_en", "cover", "status"):
        if f in d:
            setattr(a, f, d[f])
    db.session.commit()
    return jsonify(article=a.to_dict(full=True))


@bp.delete("/articles/<int:aid>")
@require_role("admin")
def article_delete(aid):
    a = db.session.get(Article, aid)
    if not a:
        return jsonify(error="not_found"), 404
    db.session.delete(a)
    db.session.commit()
    return jsonify(deleted=aid)


# ------------------------------ contact messages inbox ------------------------------

@bp.get("/messages")
@require_role("admin")
def messages_list():
    q = ContactMessage.query
    if request.args.get("unread") == "1":
        q = q.filter_by(is_read=False)
    rows = q.order_by(ContactMessage.created_at.desc()).limit(200).all()
    return jsonify(messages=[m.to_dict() for m in rows],
                   unread=ContactMessage.query.filter_by(is_read=False).count())


@bp.patch("/messages/<int:mid>")
@require_role("admin")
def message_update(mid):
    m = db.session.get(ContactMessage, mid)
    if not m:
        return jsonify(error="not_found"), 404
    m.is_read = bool((request.get_json() or {}).get("is_read", True))
    db.session.commit()
    return jsonify(message=m.to_dict())


@bp.delete("/messages/<int:mid>")
@require_role("admin")
def message_delete(mid):
    m = db.session.get(ContactMessage, mid)
    if not m:
        return jsonify(error="not_found"), 404
    db.session.delete(m)
    db.session.commit()
    return jsonify(deleted=mid)


# ------------------------------ notifications broadcast ------------------------------

@bp.post("/notifications")
@require_role("admin")
def broadcast():
    """Send a notification to all users, or a single role (?role=student|instructor)."""
    d = request.get_json() or {}
    if not d.get("title"):
        return jsonify(error="title_required"), 422
    q = User.query.filter_by(is_active=True)
    if d.get("role") in ROLES:
        q = q.filter_by(role=d["role"])
    n = 0
    for u in q.all():
        db.session.add(Notification(user_id=u.id, type="broadcast", title=d["title"], body=d.get("body")))
        n += 1
    db.session.commit()
    return jsonify(sent=n)
