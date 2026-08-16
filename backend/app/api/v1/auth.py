import os
import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request
from marshmallow import EXCLUDE, Schema, ValidationError, fields, validate
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt,
    get_jwt_identity,
)

from ...extensions import db
from ...models import Category, User, UserDevice
from ...security import hash_password, verify_password
from ...services.phone import normalize_mobile

bp = Blueprint("auth", __name__)

PROFILE_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024   # the 5 MB the profile screen promises


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
    if UserDevice.query.filter_by(user_id=user.id).count() >= UserDevice.limit_for(user):
        return False
    db.session.add(UserDevice(user_id=user.id, device_id=device_id, label=(label or "")[:160]))
    db.session.commit()
    return True


def _mobile(value):
    """A blank number and a made-up one are the same problem: the watermark needs
    a real line behind it."""
    if not value.strip():
        raise ValidationError("phone_required")
    if not normalize_mobile(value):
        raise ValidationError("phone_invalid")


class RegisterSchema(Schema):
    class Meta:
        unknown = EXCLUDE  # ignore extra fields like device_id (read from raw body)

    name = fields.Str(required=True, validate=validate.Length(min=1, max=120))
    email = fields.Email(required=True)
    phone = fields.Str(required=True, validate=validate.And(validate.Length(max=40), _mobile))
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
            "role": user.role, "locale": user.locale, "is_baytarian": user.is_baytarian,
            "headline": user.headline, "bio": user.bio, "location": user.location,
            "specialties": user.specialties or [],
            "avatar_url": user.avatar_url, "cover_url": user.cover_url,
            "created_at": user.created_at.isoformat() if user.created_at else None}


# What a learner may change about themselves, and how long each may be. Role,
# email and verification are deliberately absent — those are not self-service.
EDITABLE_PROFILE_FIELDS = {"name": 120, "headline": 200, "location": 120, "bio": 4000}


@bp.post("/register")
def register():
    try:
        data = RegisterSchema().load(request.get_json() or {})
    except ValidationError as e:
        return jsonify(error="validation", messages=e.messages), 422

    email = data["email"].lower()
    if User.query.filter_by(email=email).first():
        return jsonify(error="email_taken"), 409

    user = User(name=data["name"], email=email, phone=normalize_mobile(data["phone"]),
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
        return jsonify(error="device_limit_reached", max_devices=UserDevice.limit_for(user),
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
    data = request.get_json(silent=True) or {}

    # Phone stays required whenever it is touched: it is the video watermark, so an
    # empty one would silently weaken content protection. Fields we do not recognise
    # (role, email, is_baytarian) are ignored rather than applied.
    if "phone" in data:
        phone = data.get("phone")
        if not isinstance(phone, str) or not phone.strip() or len(phone.strip()) > 40:
            return jsonify(error="validation", messages={"phone": ["phone_required"]}), 422
        normalized = normalize_mobile(phone)
        if not normalized:
            return jsonify(error="validation", messages={"phone": ["phone_invalid"]}), 422
        user.phone = normalized

    errors = {}

    # Specialties are picked, not typed: anything that is not a live category slug
    # would show up as a chip nobody can filter or browse by.
    if "specialties" in data:
        picked = data.get("specialties") or []
        if not isinstance(picked, list) or not all(isinstance(s, str) for s in picked):
            errors["specialties"] = ["invalid"]
        else:
            known = {c.slug for c in Category.query.all()}
            # dict.fromkeys: drop duplicates, keep the order the learner picked.
            cleaned = list(dict.fromkeys(s.strip() for s in picked if s.strip()))
            unknown = [s for s in cleaned if s not in known]
            if unknown:
                errors["specialties"] = ["unknown_category"]
            elif len(cleaned) > len(known):
                errors["specialties"] = ["too_many"]
            else:
                user.specialties = cleaned or None

    for field, limit in EDITABLE_PROFILE_FIELDS.items():
        if field not in data:
            continue
        value = data[field]
        if value is None:
            value = ""
        if not isinstance(value, str) or len(value.strip()) > limit:
            errors[field] = ["invalid"]
            continue
        cleaned = value.strip()
        if field == "name" and not cleaned:
            errors[field] = ["required"]      # an account with no name breaks the watermark too
            continue
        setattr(user, field, cleaned or None)
    if errors:
        return jsonify(error="validation", messages=errors), 422

    db.session.commit()
    return jsonify(user=_user_json(user))


@bp.post("/profile/image")
@jwt_required()
def upload_profile_image():
    """A learner's own avatar or cover. The target user is the caller — there is no
    user_id parameter, so this cannot be pointed at somebody else's profile."""
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return jsonify(error="invalid_user"), 401

    kind = (request.form.get("kind") or "avatar").lower()
    if kind not in ("avatar", "cover"):
        return jsonify(error="bad_kind"), 422

    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(error="file_required"), 400
    ext = PROFILE_IMAGE_TYPES.get(f.mimetype)
    if not ext:
        return jsonify(error="unsupported_media_type", allowed=sorted(PROFILE_IMAGE_TYPES)), 415

    # Measure the stream rather than trusting Content-Length.
    f.stream.seek(0, os.SEEK_END)
    size = f.stream.tell()
    f.stream.seek(0)
    if size > PROFILE_IMAGE_MAX_BYTES:
        return jsonify(error="file_too_large", max_bytes=PROFILE_IMAGE_MAX_BYTES), 413

    folder = current_app.config["UPLOAD_IMAGE_DIR"]
    os.makedirs(folder, exist_ok=True)
    # The stored name is generated, never taken from the upload, so a crafted
    # filename cannot escape the folder or collide with someone else's file.
    name = f"u{user.id}_{kind}_{uuid.uuid4().hex[:8]}{ext}"
    f.save(os.path.join(folder, name))

    url = f"/api/v1/uploads/{name}"
    if kind == "avatar":
        user.avatar_url = url
    else:
        user.cover_url = url
    db.session.commit()
    return jsonify(user=_user_json(user), url=url), 201


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
    uid = int(get_jwt_identity())
    user = db.session.get(User, uid)
    rows = UserDevice.query.filter_by(user_id=uid).order_by(UserDevice.last_seen.desc()).all()
    return jsonify(devices=[d.to_dict() for d in rows], max_devices=UserDevice.limit_for(user))


@bp.delete("/devices/<int:did>")
@jwt_required()
def remove_device(did):
    dev = UserDevice.query.filter_by(id=did, user_id=int(get_jwt_identity())).first()
    if not dev:
        return jsonify(error="not_found"), 404
    db.session.delete(dev)
    db.session.commit()
    return jsonify(deleted=did)
