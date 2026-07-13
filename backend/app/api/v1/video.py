from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import Lesson, CourseModule, Enrollment, User
from ...services.video_provider import provider, watermark_for, VideoProviderError

bp = Blueprint("video", __name__)


@bp.post("/video/playback")
@jwt_required()
def playback():
    """Validate enrollment for the lesson's course, then mint a short-lived, watermarked
    VdoCipher OTP. Access is granted here and only here — no public URLs."""
    uid = int(get_jwt_identity())
    lesson_id = (request.get_json() or {}).get("lesson_id")
    lesson = db.session.get(Lesson, lesson_id) if lesson_id else None
    if not lesson:
        return jsonify(error="lesson_not_found"), 404
    if not lesson.vdocipher_video_id:
        return jsonify(error="no_video"), 409

    course_id = db.session.query(CourseModule.course_id).filter_by(id=lesson.module_id).scalar()
    enrollment = Enrollment.query.filter_by(user_id=uid, course_id=course_id, status="active").first()
    if not enrollment:
        return jsonify(error="not_enrolled"), 403

    user = db.session.get(User, uid)
    try:
        res = provider.issue_otp(lesson.vdocipher_video_id, annotate=watermark_for(user))
    except VideoProviderError as e:
        # no_api_key / vdocipher_* / unreachable — playback unavailable, access still gated
        return jsonify(error=str(e)), 503

    # ponytail: watch-log to MongoDB is Phase 8 (Mongo not provisioned yet); OTP issuance is the
    # access event that matters and it's already gated above.
    return jsonify(otp=res["otp"], playbackInfo=res["playbackInfo"])
