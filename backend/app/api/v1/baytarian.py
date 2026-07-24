import os

from flask import Blueprint, jsonify, request, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename

from ...extensions import db
from ...models import BaytarianRequest, User

bp = Blueprint("baytarian", __name__)

ALLOWED = {"image/jpeg", "image/png", "image/webp", "application/pdf"}
MAX_DOCS = 5


def _uid():
    return int(get_jwt_identity())


@bp.get("/baytarian/me")
@jwt_required()
def my_status():
    """Current user's Baytarian state + latest request."""
    user = db.session.get(User, _uid())
    latest = (BaytarianRequest.query.filter_by(user_id=_uid())
              .order_by(BaytarianRequest.created_at.desc()).first())
    return jsonify(is_baytarian=user.is_baytarian,
                   request=latest.to_dict() if latest else None)


@bp.post("/baytarian/request")
@jwt_required()
def submit_request():
    """Upload verification documents (PDF/images) to request Baytarian status."""
    user = db.session.get(User, _uid())
    if user.is_baytarian:
        return jsonify(error="already_verified"), 409
    if BaytarianRequest.query.filter_by(user_id=_uid(), status="pending").first():
        return jsonify(error="request_pending"), 409

    files = request.files.getlist("documents")
    files = [f for f in files if f and f.filename]
    if not files:
        return jsonify(error="documents_required"), 400
    if len(files) > MAX_DOCS:
        return jsonify(error="too_many_documents", max=MAX_DOCS), 400
    for f in files:
        if f.mimetype not in ALLOWED:
            return jsonify(error="unsupported_media_type", allowed=sorted(ALLOWED)), 415

    folder = os.path.join(current_app.config["BAYTARIAN_DOC_DIR"], str(_uid()))
    os.makedirs(folder, exist_ok=True)
    saved = []
    for i, f in enumerate(files):
        name = f"{i}_{secure_filename(f.filename)}"
        path = os.path.join(folder, name)
        f.save(path)
        saved.append(path)

    req = BaytarianRequest(user_id=_uid(), status="pending",
                           documents=saved, note=(request.form.get("note") or "")[:500])
    db.session.add(req)
    db.session.commit()
    return jsonify(request=req.to_dict()), 201
