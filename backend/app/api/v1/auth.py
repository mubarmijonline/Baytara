from flask import Blueprint, jsonify, request
from marshmallow import Schema, ValidationError, fields, validate
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
)

from ...extensions import db
from ...models import User
from ...security import hash_password, verify_password

bp = Blueprint("auth", __name__)


class RegisterSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=120))
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))


class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.Str(required=True)


def _tokens(user: User):
    claims = {"role": user.role}
    ident = str(user.id)
    return {
        "access_token": create_access_token(identity=ident, additional_claims=claims),
        "refresh_token": create_refresh_token(identity=ident, additional_claims=claims),
    }


def _user_json(user: User):
    return {"id": user.id, "name": user.name, "email": user.email, "role": user.role, "locale": user.locale}


@bp.post("/register")
def register():
    try:
        data = RegisterSchema().load(request.get_json() or {})
    except ValidationError as e:
        return jsonify(error="validation", messages=e.messages), 422

    email = data["email"].lower()
    if User.query.filter_by(email=email).first():
        return jsonify(error="email_taken"), 409

    user = User(name=data["name"], email=email, password_hash=hash_password(data["password"]), role="student")
    db.session.add(user)
    db.session.commit()
    return jsonify(user=_user_json(user), **_tokens(user)), 201


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
    return jsonify(user=_user_json(user), **_tokens(user))


@bp.post("/refresh")
@jwt_required(refresh=True)
def refresh():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user or not user.is_active:
        return jsonify(error="invalid_user"), 401
    return jsonify(access_token=create_access_token(identity=str(user.id), additional_claims={"role": user.role}))


@bp.get("/me")
@jwt_required()
def me():
    user = db.session.get(User, int(get_jwt_identity()))
    if not user:
        return jsonify(error="not_found"), 404
    return jsonify(user=_user_json(user))


@bp.post("/logout")
@jwt_required()
def logout():
    # ponytail: stateless logout — client discards tokens. Server-side revocation
    # (Redis JWT denylist + refresh rotation) lands in Phase 4 when Redis is wired.
    return jsonify(status="logged_out")
