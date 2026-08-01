from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt,
    get_jwt_identity,
)

from ...extensions import db
from ...models import User, UserDevice
from ...security import hash_password, verify_password

bp = Blueprint("auth", __name__)


def _register_device(user, device_id, label):
    """Device Limit (contract البند2): track devices, block a 3rd distinct one.
    Returns True if allowed, False if the device cap is reached. No-op (allowed)
    when the client sends no device_id."""
    if not device_id:
        return True
    now = datetime.now(timezone.utc)
    dev = UserDevice.query.filter_by(user_id=user.id, device_id=device_id).first()
    if dev:
        dev.last_seen = now
        if label:
            dev.label = label[:160]
        db.session.commit()
        return True
    if UserDevice.query.filter_by(user_id=user.id).count() >= UserDevice.MAX_DEVICES:
        return False
    db.session.add(UserDevice(user_id=user.id, device_id=device_id, label=(label or "")[:160]))
    db.session.commit()
    return True


def _nonblank_phone(value):
    if not value.strip():
        raise ValidationError("phone_required")


class RegisterSchema(Schema):
    class Meta:
        unknown = EXCLUDE  # ignore extra fields like device_id (read from raw body)

    name = fields.Str(required=True, validate=validate.Length(min=1, max=120))
    email = fields.Email(required=True)
    phone = fields.Str(required=True, validate=validate.And(validate.Length(max=40), _nonblank_phone))
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))


class LoginSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = fields.Email(required=True)
    password = fields.Str(required=True)


def _tokens(user: User, device_id=None):
    claims = {"role": user.role}
    if device_id:
        claims["device_id"] = device_id
    ident = str(user.id)
    return {
        "access_token": create_access_token(identity=ident, additional_claims=claims),
        "refresh_token": create_refresh_token(identity=ident, additional_claims=claims),
    }


def _user_json(user: User):
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone,
            "role": user.role, "locale": user.locale, "is_baytarian": user.is_baytarian}


@bp.post("/register")
def register():
    try:
        data = RegisterSchema().load(request.get_json() or {})
    except ValidationError as e:
        return jsonify(error="validation", messages=e.messages), 422

    email = data["email"].lower()
    if User.query.filter_by(email=email).first():
        return jsonify(error="email_taken"), 409

    user = User(name=data["name"], email=email, phone=data["phone"].strip(),
                password_hash=hash_password(data["password"]), role="student")
    db.session.add(user)
    db.session.commit()
    body = request.get_json() or {}
    _register_device(user, body.get("device_id"), request.headers.get("User-Agent"))
    device_id = body.get("device_id")
    return jsonify(user=_user_json(user), **_tokens(user, device_id)), 201


@bp.post("/login")
def login():
    try:
        data = LoginSchema().load(request.get_json() or {})
    except ValidationError as e:
        return jsonify(error="validation", messages=e.messages), 422

    user = User.query.filter_by(email=data["email"].lower()).first()
    if not user or not verify_password(user.password_hash, data["password"]):
        return jsonify(error="invalid_credentials"), 401
    if not user.is_active:
        return jsonify(error="account_disabled"), 403
    body = request.get_json() or {}
    if not _register_device(user, body.get("device_id"), request.headers.get("User-Agent")):
        # cap reached — surface the devices so the user can remove one and retry
        devices = UserDevice.query.filter_by(user_id=user.id).order_by(UserDevice.last_seen).all()
        return jsonify(error="device_limit_reached", max_devices=UserDevice.MAX_DEVICES,
                       devices=[d.to_dict() for d in devices]), 403
    return jsonify(user=_user_json(user), **_tokens(user, body.get("device_id")))


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return jsonify(error="invalid_user"), 401
    device_id = get_jwt().get("device_id")
    claims = {"role": user.role}
    if device_id:
        device = UserDevice.query.filter_by(user_id=user.id, device_id=device_id).first()
        if not device:
            return jsonify(error="device_not_registered"), 403
        device.last_seen = datetime.now(timezone.utc)
        claims["device_id"] = device_id
        db.session.commit()
    return jsonify(access_token=create_access_token(identity=str(user.id), additional_claims=claims))


@bp.get("/me")
@jwt_required()
def me():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify(error="not_found"), 404
    return jsonify(user=_user_json(user))


@bp.patch("/profile")
@jwt_required()
def update_profile():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return jsonify(error="invalid_user"), 401
    phone = (request.get_json(silent=True) or {}).get("phone")
    if not isinstance(phone, str) or not phone.strip() or len(phone.strip()) > 40:
        return jsonify(error="validation", messages={"phone": ["phone_required"]}), 422
    user.phone = phone.strip()
    db.session.commit()
    return jsonify(user=_user_json(user))


@bp.post("/logout")
@jwt_required()
def logout():
    # ponytail: stateless logout — client discards tokens. Server-side revocation
    # (Redis JWT denylist + refresh rotation) lands in Phase 4 when Redis is wired.
    # If the client names its device, free that slot so a re-login elsewhere fits.
    device_id = (request.get_json(silent=True) or {}).get("device_id")
    if device_id:
        UserDevice.query.filter_by(user_id=int(get_jwt_identity()), device_id=device_id).delete()
        db.session.commit()
    return jsonify(status="logged_out")


@bp.get("/devices")
@jwt_required()
def list_devices():
    rows = UserDevice.query.filter_by(user_id=int(get_jwt_identity())).order_by(
        UserDevice.last_seen.desc()).all()
    return jsonify(devices=[d.to_dict() for d in rows], max_devices=UserDevice.MAX_DEVICES)


@bp.delete("/devices/<int:did>")
@jwt_required()
def remove_device(did):
    dev = UserDevice.query.filter_by(id=did, user_id=int(get_jwt_identity())).first()
    if not dev:
        return jsonify(error="not_found"), 404
    db.session.delete(dev)
    db.session.commit()
    return jsonify(deleted=did)
