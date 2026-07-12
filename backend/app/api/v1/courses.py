from flask import Blueprint, jsonify, request

from ...extensions import db
from ...models import Category, Course, User

bp = Blueprint("courses", __name__)


@bp.get("/categories")
def list_categories():
    cats = Category.query.order_by(Category.name).all()
    return jsonify(categories=[c.to_dict() for c in cats])


@bp.get("/courses")
def list_courses():
    """Public course listing: only published. Filter by ?category=<slug>, ?q=<search>, paginated."""
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 12, type=int), 1), 50)

    q = Course.query.filter_by(status="published")
    cat_slug = request.args.get("category")
    if cat_slug:
        q = q.join(Category).filter(Category.slug == cat_slug)
    search = request.args.get("q")
    if search:
        q = q.filter(Course.title.ilike(f"%{search}%"))

    q = q.order_by(Course.created_at.desc())
    pg = db.paginate(q, page=page, per_page=per_page, error_out=False)
    return jsonify(
        courses=[c.to_dict() for c in pg.items],
        total=pg.total,
        page=pg.page,
        per_page=pg.per_page,
        pages=pg.pages,
    )


@bp.get("/courses/<slug>")
def course_detail(slug):
    course = Course.query.filter_by(slug=slug, status="published").first()
    if not course:
        return jsonify(error="not_found"), 404
    return jsonify(course=course.to_dict(with_content=True))


@bp.get("/instructors/<int:user_id>")
def instructor_profile(user_id):
    user = User.query.filter_by(id=user_id, role="instructor").first()
    if not user:
        return jsonify(error="not_found"), 404
    courses = Course.query.filter_by(instructor_id=user.id, status="published").all()
    return jsonify(
        instructor={"id": user.id, "name": user.name},
        courses=[c.to_dict() for c in courses],
    )
