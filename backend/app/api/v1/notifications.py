from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import Notification

bp = Blueprint("notifications", __name__)


def _uid():
    return int(get_jwt_identity())


@bp.get("/notifications")
@jwt_required()
def my_notifications():
    rows = (Notification.query.filter_by(user_id=_uid())
            .order_by(Notification.created_at.desc()).limit(50).all())
    unread = Notification.query.filter_by(user_id=_uid(), is_read=False).count()
    return jsonify(notifications=[n.to_dict() for n in rows], unread=unread)


@bp.get("/notifications/unread-count")
@jwt_required()
def unread_count():
    return jsonify(unread=Notification.query.filter_by(user_id=_uid(), is_read=False).count())


@bp.post("/notifications/<int:nid>/read")
@jwt_required()
def mark_read(nid):
    n = db.session.get(Notification, nid)
    if not n or n.user_id != _uid():
        return jsonify(error="not_found"), 404
    n.is_read = True
    db.session.commit()
    return jsonify(notification=n.to_dict())


@bp.post("/notifications/read-all")
@jwt_required()
def read_all():
    Notification.query.filter_by(user_id=_uid(), is_read=False).update({"is_read": True})
    db.session.commit()
    return jsonify(status="ok")
