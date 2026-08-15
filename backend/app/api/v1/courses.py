from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import (
    Category, Course, Bundle, CourseReview, Enrollment, LearningPath, Lesson, User,
    refresh_course_rating,
)
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
    # One grouped count rather than a query per category: the video library shows a
    # number on every chip, and a listing of six chips should not be six round trips.
    counts = dict(
        db.session.query(Lesson.category_id, db.func.count(Lesson.id))
        .filter(Lesson.status == "published", Lesson.vdocipher_video_id.isnot(None))
        .group_by(Lesson.category_id)
        .all()
    )
    return jsonify(categories=[{**c.to_dict(lang), "video_count": counts.get(c.id, 0)} for c in cats])


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


# ------------------------------ course reviews ------------------------------

def _published_course(slug):
    return Course.query.filter_by(slug=slug, status="published").first()


@bp.get("/courses/<slug>/reviews")
def list_reviews(slug):
    course = _published_course(slug)
    if not course:
        return jsonify(error="not_found"), 404
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 10, type=int), 1), 50)
    q = (CourseReview.query
         .filter_by(course_id=course.id, status="published")
         .order_by(CourseReview.created_at.desc(), CourseReview.id.desc()))
    pg = db.paginate(q, page=page, per_page=per_page, error_out=False)
    return jsonify(reviews=[r.to_dict() for r in pg.items], total=pg.total,
                   page=pg.page, pages=pg.pages,
                   rating=course.rating(), reviews_count=course.rating_count)


@bp.post("/courses/<slug>/reviews")
@jwt_required()
def upsert_review(slug):
    """Only someone who actually has access may review. One review per learner, so a
    second POST edits the first rather than stacking."""
    course = _published_course(slug)
    if not course:
        return jsonify(error="not_found"), 404
    user = _current_user()

    rating = (request.get_json() or {}).get("rating")
    if not isinstance(rating, int) or isinstance(rating, bool) or not 1 <= rating <= 5:
        return jsonify(error="bad_rating"), 422

    enrollment = Enrollment.query.filter_by(user_id=user.id, course_id=course.id, status="active").first()
    if not enrollment or enrollment.is_expired():
        return jsonify(error="not_enrolled"), 403

    review = CourseReview.query.filter_by(course_id=course.id, user_id=user.id).first()
    if not review:
        review = CourseReview(course_id=course.id, user_id=user.id)
        db.session.add(review)
    review.rating = rating
    review.body = str((request.get_json() or {}).get("body") or "").strip()
    db.session.flush()
    refresh_course_rating(course)
    db.session.commit()
    return jsonify(review=review.to_dict(), rating=course.rating(), reviews_count=course.rating_count)


@bp.delete("/courses/<slug>/reviews/mine")
@jwt_required()
def delete_my_review(slug):
    course = _published_course(slug)
    if not course:
        return jsonify(error="not_found"), 404
    review = CourseReview.query.filter_by(course_id=course.id, user_id=_current_user().id).first()
    if not review:
        return jsonify(error="not_found"), 404
    db.session.delete(review)
    db.session.flush()
    refresh_course_rating(course)
    db.session.commit()
    return jsonify(deleted=review.id, rating=course.rating(), reviews_count=course.rating_count)


# ------------------------------ learning paths (public) ------------------------------

@bp.get("/paths")
@jwt_required(optional=True)
def list_paths():
    lang = req_lang()
    rows = (LearningPath.query.filter_by(status="published")
            .order_by(LearningPath.sort_order, LearningPath.id).all())
    return jsonify(paths=[p.to_dict(lang=lang) for p in rows])


@bp.get("/paths/<slug>")
@jwt_required(optional=True)
def path_detail(slug):
    user = _current_user()
    path = LearningPath.query.filter_by(slug=slug, status="published").first()
    if not path:
        return jsonify(error="not_found"), 404
    return jsonify(path=path.to_dict(lang=req_lang(), with_courses=True, user=user))


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
