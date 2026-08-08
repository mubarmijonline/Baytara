from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import Category, Course, Bundle, User
from ...services.catalog_access import audience_error
from ...utils import req_lang

bp = Blueprint("courses", __name__)


def _current_user():
    """Resolve the caller from an optional bearer token (None if anonymous)."""
    ident = get_jwt_identity()
    return db.session.get(User, int(ident)) if ident else None


@bp.get("/categories")
def list_categories():
    lang = req_lang()
    cats = Category.query.order_by(Category.sort_order, Category.id).all()
    return jsonify(categories=[c.to_dict(lang) for c in cats])


@bp.get("/courses")
@jwt_required(optional=True)
def list_courses():
    """Public course listing: only published. Filter by ?category=<slug>, ?q=<search>,
    ?access_type=<t>, paginated. Audience-restricted courses are shown only when
    the shared policy permits public visibility."""
    user = _current_user()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 12, type=int), 1), 50)

    q = Course.query.filter_by(status="published")
    cat_slug = request.args.get("category")
    if cat_slug:
        q = q.join(Category).filter(Category.slug == cat_slug)
    atype = request.args.get("access_type")
    if atype:
        q = q.filter(Course.access_type == atype)
    search = request.args.get("q")
    if search:
        q = q.filter(Course.title.ilike(f"%{search}%"))

    if audience_error(user, "vet_free"):
        q = q.filter(Course.access_type != "vet_free")

    q = q.order_by(Course.created_at.desc())
    lang = req_lang()
    pg = db.paginate(q, page=page, per_page=per_page, error_out=False)
    return jsonify(
        courses=[c.to_dict(lang=lang, user=user) for c in pg.items],
        total=pg.total,
        page=pg.page,
        per_page=pg.per_page,
        pages=pg.pages,
    )


@bp.get("/courses/<slug>")
@jwt_required(optional=True)
def course_detail(slug):
    user = _current_user()
    course = Course.query.filter_by(slug=slug, status="published").first()
    if not course:
        return jsonify(error="not_found"), 404
    if not course.visible_to(user):
        return jsonify(error="not_found"), 404  # vet_free hidden from non-instructors
    return jsonify(course=course.to_dict(with_content=True, lang=req_lang(), user=user))


# ------------------------------ bundles (public) ------------------------------

@bp.get("/bundles")
@jwt_required(optional=True)
def list_bundles():
    lang = req_lang()
    user = _current_user()
    rows = Bundle.query.filter_by(status="published").order_by(Bundle.created_at.desc()).all()
    return jsonify(bundles=[b.to_dict(with_courses=True, lang=lang, user=user) for b in rows])


@bp.get("/bundles/<slug>")
@jwt_required(optional=True)
def bundle_detail(slug):
    user = _current_user()
    b = Bundle.query.filter_by(slug=slug, status="published").first()
    if not b:
        return jsonify(error="not_found"), 404
    return jsonify(bundle=b.to_dict(with_courses=True, lang=req_lang(), user=user))


def _instructor_stats(user, courses):
    """Real figures for a public instructor profile — no placeholders."""
    return {"courses": len(courses),
            "students": sum(c.enrolled_count for c in courses),
            "lessons": sum(len(c.content_videos()) for c in courses),
            "minutes": sum(c.video_minutes() for c in courses)}


@bp.get("/instructors")
def list_instructors():
    lang = req_lang()
    rows = User.query.filter_by(role="instructor", is_active=True).all()
    out = []
    for u in rows:
        courses = Course.query.filter_by(instructor_id=u.id, status="published").all()
        p = u.public_profile(lang)
        p.update(_instructor_stats(u, courses))
        out.append(p)
    return jsonify(instructors=out)


@bp.get("/instructors/<int:user_id>")
def instructor_profile(user_id):
    lang = req_lang()
    user = User.query.filter_by(id=user_id, role="instructor").first()
    if not user:
        return jsonify(error="not_found"), 404
    courses = Course.query.filter_by(instructor_id=user.id, status="published").all()
    profile = user.public_profile(lang)
    profile.update(_instructor_stats(user, courses))
    return jsonify(
        instructor=profile,
        courses=[c.to_dict(lang=lang) for c in courses],
    )
