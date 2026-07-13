from flask import Blueprint, jsonify, request

from ...extensions import db
from datetime import datetime, timezone

from ...models import (
    User, Category, Course, CourseModule, Lesson, Enrollment, InstapayPayment,
    Setting, Article, ContactMessage, Notification,
)
from ...security import require_role, hash_password
from ...utils import slugify
from flask_jwt_extended import get_jwt_identity

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
        payments={"pending": InstapayPayment.query.filter_by(status="pending").count()},
    )


# ------------------------------ users ------------------------------

def _user_json(u):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role,
            "is_active": u.is_active, "created_at": u.created_at.isoformat() if u.created_at else None,
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
    for f in ("headline", "bio", "avatar_url", "expertise",
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
    c = Category(name=d["name"],
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
    if "name" in d:
        c.name = d["name"]
    db.session.commit()
    return jsonify(category=c.to_dict())


@bp.delete("/categories/<int:cid>")
@require_role("admin")
def category_delete(cid):
    c = db.session.get(Category, cid)
    if not c:
        return jsonify(error="not_found"), 404
    if Course.query.filter_by(category_id=cid).count():
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
    c = Course(
        title=d["title"],
        slug=slugify(d.get("slug") or d["title"], lambda s: Course.query.filter_by(slug=s).first() is not None),
        description=d.get("description", ""),
        image=d.get("image"),
        price=d.get("price", 0),
        currency=d.get("currency", "EGP"),
        instructor_id=instr_id,
        category_id=d.get("category_id"),
        duration_minutes=d.get("duration_minutes"),
        status=status,
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
    for f in ("title", "description", "image", "price", "currency", "instructor_id",
              "category_id", "duration_minutes", "status"):
        if f in d:
            setattr(c, f, d[f])
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
    m = CourseModule(course_id=cid, title=d.get("title", "وحدة"), position=d.get("position", 0))
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
    for f in ("title", "position"):
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
    l = Lesson(
        module_id=mid,
        title=d.get("title", "درس"),
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
    for f in ("title", "position", "duration_minutes", "vdocipher_video_id", "is_protected"):
        if f in d:
            setattr(l, f, d[f])
    db.session.commit()
    return jsonify(lesson=l.to_dict())


@bp.delete("/lessons/<int:lid>")
@require_role("admin")
def lesson_delete(lid):
    l = db.session.get(Lesson, lid)
    if not l:
        return jsonify(error="not_found"), 404
    db.session.delete(l)
    db.session.commit()
    return jsonify(deleted=lid)


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
        slug=slugify(d.get("slug") or d["title"], lambda s: Article.query.filter_by(slug=s).first() is not None),
        excerpt=d.get("excerpt"),
        body=d.get("body", ""),
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
    for f in ("type", "title", "excerpt", "body", "cover", "status"):
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
