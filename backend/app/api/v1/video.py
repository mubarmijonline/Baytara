from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import Category, Lesson, User
from ...services.catalog_access import audience_error, video_access
from ...services.video_provider import provider, watermark_for, VideoProviderError
from ...utils import req_lang

bp = Blueprint("video", __name__)


def _current_user():
    ident = get_jwt_identity()
    return db.session.get(User, int(ident)) if ident else None


def _public_video_dict(video, user, lang):
    data = video.to_dict(lang=lang, user=user)
    data["can_play"] = video_access(user, video)[0]
    return data


@bp.get("/videos")
@jwt_required(optional=True)
def videos():
    """Published video catalog, localized and filterable by category/access type."""
    user = _current_user()
    page = max(request.args.get("page", 1, type=int), 1)
    per_page = min(max(request.args.get("per_page", 12, type=int), 1), 50)
    query = Lesson.query.filter(
        Lesson.status == "published",
        Lesson.vdocipher_video_id.isnot(None),
    )
    category = request.args.get("category")
    if category:
        query = query.join(Category).filter(Category.slug == category)
    access_type = request.args.get("access_type")
    if access_type:
        query = query.filter(Lesson.access_type == access_type)
    search = (request.args.get("q") or "").strip()
    if search:
        like = f"%{search}%"
        query = query.filter(db.or_(Lesson.title.ilike(like), Lesson.title_en.ilike(like)))
    if audience_error(user, "vet_free"):
        query = query.filter(Lesson.access_type != "vet_free")

    result = db.paginate(
        query.order_by(Lesson.created_at.desc(), Lesson.id.desc()),
        page=page, per_page=per_page, error_out=False,
    )
    lang = req_lang()
    return jsonify(
        videos=[_public_video_dict(video, user, lang) for video in result.items],
        total=result.total,
        page=result.page,
        per_page=result.per_page,
        pages=result.pages,
    )


@bp.get("/videos/<int:video_id>")
@jwt_required(optional=True)
def video_detail(video_id):
    user = _current_user()
    video = db.session.get(Lesson, video_id)
    if not video or video.status != "published" or not video.vdocipher_video_id:
        return jsonify(error="not_found"), 404
    if video.access_type == "vet_free" and audience_error(user, "vet_free"):
        return jsonify(error="not_found"), 404
    return jsonify(video=_public_video_dict(video, user, req_lang()))


@bp.post("/video/playback")
@jwt_required(optional=True)
def playback():
    """Validate enrollment for the lesson's course, then mint a short-lived, watermarked
    VdoCipher OTP. Access is granted here and only here — no public URLs."""
    identity = get_jwt_identity()
    lesson_id = (request.get_json() or {}).get("lesson_id")
    lesson = db.session.get(Lesson, lesson_id) if lesson_id else None
    if not lesson:
        return jsonify(error="lesson_not_found"), 404
    if not lesson.vdocipher_video_id:
        return jsonify(error="no_video"), 409

    user = db.session.get(User, int(identity)) if identity else None
    privileged = user is not None and user.role == "admin"
    if lesson.status != "published" and not privileged:
        return jsonify(error="not_entitled"), 403
    if user is None and lesson.access_type != "free":
        return jsonify(error="not_entitled"), 403
    allowed, reason = video_access(user, lesson)
    if not allowed:
        return jsonify(error=reason), 403
    try:
        res = provider.issue_otp(lesson.vdocipher_video_id, annotate=watermark_for(user))
    except VideoProviderError as e:
        # no_api_key / vdocipher_* / unreachable — playback unavailable, access still gated
        return jsonify(error=str(e)), 503

    # ponytail: watch-log to MongoDB is Phase 8 (Mongo not provisioned yet); OTP issuance is the
    # access event that matters and it's already gated above.
    return jsonify(otp=res["otp"], playbackInfo=res["playbackInfo"])
