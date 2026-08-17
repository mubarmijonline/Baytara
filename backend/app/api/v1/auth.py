import os
import uuid
from datetime import datetime, timezone

from flask import Blueprint, current_app, jsonify, request, send_file
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
from ...services.google_auth import GoogleAuthError, verify_id_token
from ...services.phone import normalize_mobile
from ...services.vet_card import only_digits, parse_national_id

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


def _device_limit_response(user: User):
    """Cap reached — surface the devices so the user can remove one and retry."""
    devices = UserDevice.query.filter_by(user_id=user.id).order_by(UserDevice.last_seen).all()
    return jsonify(error="device_limit_reached", max_devices=UserDevice.limit_for(user),
                   devices=[d.to_dict() for d in devices]), 403


def _user_json(user: User):
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone,
            "role": user.role, "locale": user.locale, "is_baytarian": user.is_baytarian,
            "is_vet_student": user.is_vet_student,
            "headline": user.headline, "bio": user.bio, "location": user.location,
            "specialties": user.specialties or [],
            # Own profile only. public_profile() must never carry these.
            "national_id": user.national_id,
            "national_id_locked": bool(user.national_id),
            "has_national_id_image": bool(user.national_id_image),
            "vet_registration_no": user.vet_registration_no,
            "vet_license_no": user.vet_license_no,
            "vet_governorate": user.vet_governorate,
            "vet_card_expires_at": user.vet_card_expires_at.isoformat() if user.vet_card_expires_at else None,
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
        return _device_limit_response(user)
    return jsonify(user=_user_json(user), **_tokens(user, body.get("device_id")))


@bp.get("/google-config")
def google_config():
    """Client id for the browser SDK. Empty string when Google sign-in is not
    configured — the frontend reads that as "hide the Google button"."""
    ids = current_app.config.get("GOOGLE_OAUTH_CLIENT_IDS") or []
    return jsonify(client_id=ids[0] if ids else "")


@bp.post("/google")
def google_login():
    """Sign in (or sign up) with a Google ID token from the Sign In With Google
    client. Google never provides a phone number, which the contract requires for
    the video watermark, so `needs_phone` tells the client to collect it before
    anything else."""
    body = request.get_json(silent=True) or {}
    credential = body.get("credential")
    if not isinstance(credential, str) or not credential.strip():
        return jsonify(error="validation", messages={"credential": ["credential_required"]}), 422
    try:
        claims = verify_id_token(credential, current_app.config.get("GOOGLE_OAUTH_CLIENT_IDS") or [])
    except GoogleAuthError as exc:
        reason = str(exc)
        if reason == "google_not_configured":
            return jsonify(error="google_not_configured"), 503
        return jsonify(error="invalid_google_token", reason=reason), 401

    email = claims["email"].lower()
    user = User.query.filter_by(google_sub=claims["sub"]).first()
    created = False
    if not user:
        user = User.query.filter_by(email=email).first()
        if user:
            user.google_sub = claims["sub"]  # link Google to the existing account
        else:
            user = User(name=(claims.get("name") or email.split("@")[0])[:120], email=email,
                        google_sub=claims["sub"], role="student")
            db.session.add(user)
            created = True
        db.session.commit()
    if not user.is_active:
        return jsonify(error="account_disabled"), 403

    device_id = body.get("device_id")
    if not _register_device(user, device_id, request.headers.get("User-Agent")):
        return _device_limit_response(user)
    return jsonify(user=_user_json(user), needs_phone=not (user.phone or "").strip(),
                   **_tokens(user, device_id)), (201 if created else 200)


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

    # The national ID is the account's identity for verification: it is what a
    # syndicate card is matched against. Write-once, because a learner who could edit
    # it after verifying could point a verified account at someone else. Fourteen ASCII
    # digits — Arabic-Indic input is converted rather than refused.
    if "national_id" in data:
        digits = only_digits(data.get("national_id"))
        if user.national_id and digits != user.national_id:
            errors["national_id"] = ["locked"]
        elif not user.national_id:
            decoded, why = parse_national_id(digits)
            if not decoded:
                errors["national_id"] = [why or "invalid"]
            elif User.query.filter(User.national_id == digits, User.id != user.id).first():
                # One person, one account: the card check downstream relies on this.
                errors["national_id"] = ["already_used"]
            else:
                user.national_id = digits

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


# ------------------------- national ID card (private) -------------------------

@bp.post("/national-id")
@jwt_required()
def upload_national_id():
    """Read the learner's national ID from a photo of their card and record both.

    The image is evidence, so it is stored with the verification documents rather than
    in the public uploads folder — it is served back only to its owner and to admins.
    """
    from ...services.instapay_ocr import extract_text
    from ...services.vet_card import read_national_id

    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return jsonify(error="invalid_user"), 401

    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(error="file_required"), 400
    ext = PROFILE_IMAGE_TYPES.get(f.mimetype)
    if not ext:
        return jsonify(error="unsupported_media_type", allowed=sorted(PROFILE_IMAGE_TYPES)), 415
    f.stream.seek(0, os.SEEK_END)
    if f.stream.tell() > PROFILE_IMAGE_MAX_BYTES:
        return jsonify(error="file_too_large", max_bytes=PROFILE_IMAGE_MAX_BYTES), 413
    f.stream.seek(0)

    try:
        decoded = read_national_id(extract_text(f))
    except Exception:  # noqa: BLE001 — a Vision outage is not a validation failure
        current_app.logger.exception("vision failed reading a national ID card")
        return jsonify(error="ocr_unavailable"), 503
    if not decoded:
        return jsonify(error="national_id_unreadable"), 422

    number = decoded["national_id"]
    # Already on file: the photo has to be of that same person, which is what makes
    # the image evidence rather than decoration.
    if user.national_id and number != user.national_id:
        return jsonify(error="does_not_match_profile"), 422
    if User.query.filter(User.national_id == number, User.id != user.id).first():
        return jsonify(error="already_used"), 409

    folder = os.path.join(current_app.config["BAYTARIAN_DOC_DIR"], str(user.id))
    os.makedirs(folder, exist_ok=True)
    # Generated name: a crafted filename must not escape the folder.
    path = os.path.join(folder, f"nid_{uuid.uuid4().hex[:8]}{ext}")
    f.stream.seek(0)
    f.save(path)

    user.national_id = number
    user.national_id_image = path
    db.session.commit()
    return jsonify(user=_user_json(user), national_id=number, born=decoded["born"],
                   governorate=decoded["governorate"]), 201


@bp.get("/national-id/image")
@jwt_required()
def my_national_id_image():
    """The owner's own card image. There is no user_id parameter, so this cannot be
    pointed at anybody else's."""
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.national_id_image or not os.path.exists(user.national_id_image):
        return jsonify(error="not_found"), 404
    return send_file(os.path.abspath(user.national_id_image))
