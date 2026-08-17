"""End-to-end auth self-check. Run: python -m tests.test_auth  (needs DATABASE_URL).

ponytail: one runnable check for the whole auth path (register->login->me->refresh->
duplicate/bad-password guards). No framework/fixtures until a real suite is asked for.
"""
import uuid

import pytest
from flask_jwt_extended import decode_token

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import User, UserDevice


@pytest.fixture
def auth_app(tmp_path):
    config = type("AuthTestConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'auth.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def test_registration_requires_phone_and_tokens_are_bound_to_device(auth_app):
    client = auth_app.test_client()
    base = {"name": "Viewer", "email": "viewer@example.test", "password": "secret12", "device_id": "browser-1"}

    missing = client.post("/api/v1/auth/register", json=base)
    assert missing.status_code == 422
    blank = client.post("/api/v1/auth/register", json={**base, "phone": "   "})
    assert blank.status_code == 422

    created = client.post("/api/v1/auth/register", json={**base, "phone": "  +201000000000  "})
    assert created.status_code == 201
    assert created.get_json()["user"]["phone"] == "+201000000000"
    with auth_app.app_context():
        assert decode_token(created.get_json()["access_token"])["device_id"] == "browser-1"
        assert decode_token(created.get_json()["refresh_token"])["device_id"] == "browser-1"

    login = client.post("/api/v1/auth/login", json={
        "email": base["email"], "password": base["password"], "device_id": "browser-1",
    })
    with auth_app.app_context():
        assert decode_token(login.get_json()["access_token"])["device_id"] == "browser-1"


def test_profile_phone_update_and_refresh_rejects_removed_device(auth_app):
    client = auth_app.test_client()
    created = client.post("/api/v1/auth/register", json={
        "name": "Viewer", "email": "profile@example.test", "phone": "+201000000001",
        "password": "secret12", "device_id": "browser-profile",
    }).get_json()
    access_headers = {"Authorization": f"Bearer {created['access_token']}"}
    refresh_headers = {"Authorization": f"Bearer {created['refresh_token']}"}

    updated = client.patch("/api/v1/auth/profile", headers=access_headers, json={
        "phone": " +201099999999 ",
    })
    assert updated.status_code == 200
    assert updated.get_json()["user"]["phone"] == "+201099999999"

    refreshed = client.post("/api/v1/auth/refresh", headers=refresh_headers)
    assert refreshed.status_code == 200
    with auth_app.app_context():
        assert decode_token(refreshed.get_json()["access_token"])["device_id"] == "browser-profile"
        UserDevice.query.filter_by(device_id="browser-profile").delete()
        db.session.commit()

    rejected = client.post("/api/v1/auth/refresh", headers=refresh_headers)
    assert rejected.status_code == 403
    assert rejected.get_json() == {"error": "device_not_registered"}


@pytest.fixture
def google_app(tmp_path):
    config = type("GoogleTestConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'google.sqlite'}",
        "GOOGLE_OAUTH_CLIENT_IDS": ["web-client.apps.googleusercontent.com"],
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def _fake_google(monkeypatch, **overrides):
    """Stub only Google's certs/signature check, so our own audience,
    email_verified and linking rules stay under test."""
    claims = {
        "aud": "web-client.apps.googleusercontent.com",
        "sub": "google-sub-1",
        "email": "Vet@Gmail.test",
        "email_verified": True,
        "name": "Google Vet",
        **overrides,
    }
    monkeypatch.setattr("app.services.google_auth.id_token.verify_oauth2_token",
                        lambda *a, **k: claims)
    return claims


def test_google_sign_in_creates_account_then_links_and_needs_a_phone(google_app, monkeypatch):
    client = google_app.test_client()
    _fake_google(monkeypatch)

    first = client.post("/api/v1/auth/google", json={"credential": "tok", "device_id": "browser-g"})
    assert first.status_code == 201
    body = first.get_json()
    # Google gives no phone: the client must collect it before playback.
    assert body["needs_phone"] is True
    assert body["user"]["email"] == "vet@gmail.test" and body["user"]["role"] == "student"
    with google_app.app_context():
        assert decode_token(body["access_token"])["device_id"] == "browser-g"
        user = User.query.filter_by(email="vet@gmail.test").one()
        assert user.google_sub == "google-sub-1" and user.password_hash is None

    # a password-less account cannot be logged into by password
    assert client.post("/api/v1/auth/login", json={
        "email": "vet@gmail.test", "password": "secret12",
    }).status_code == 401

    # second sign-in reuses the account, and the phone is no longer missing
    client.patch("/api/v1/auth/profile", headers={"Authorization": f"Bearer {body['access_token']}"},
                 json={"phone": "+201000000002"})
    again = client.post("/api/v1/auth/google", json={"credential": "tok", "device_id": "browser-g"})
    assert again.status_code == 200 and again.get_json()["needs_phone"] is False


def test_google_sign_in_rejects_bad_audience_and_unverified_email(google_app, monkeypatch):
    client = google_app.test_client()

    _fake_google(monkeypatch, aud="someone-elses-client.apps.googleusercontent.com")
    stolen = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert stolen.status_code == 401 and stolen.get_json()["reason"] == "audience_mismatch"

    # unverified email must not link to an existing password account (takeover)
    client.post("/api/v1/auth/register", json={
        "name": "Owner", "email": "owner@example.test", "phone": "+201000000003", "password": "secret12",
    })
    _fake_google(monkeypatch, email="owner@example.test", email_verified=False, sub="attacker-sub")
    takeover = client.post("/api/v1/auth/google", json={"credential": "tok"})
    assert takeover.status_code == 401 and takeover.get_json()["reason"] == "email_unverified"

    assert client.post("/api/v1/auth/google", json={}).status_code == 422


def test_google_config_is_empty_when_unconfigured(auth_app):
    assert auth_app.test_client().get("/api/v1/auth/google-config").get_json() == {"client_id": ""}
    assert auth_app.test_client().post("/api/v1/auth/google",
                                      json={"credential": "tok"}).status_code == 503


def demo():
    app = create_app()
    with app.app_context():
        db.create_all()
    c = app.test_client()
    email = f"t_{uuid.uuid4().hex[:8]}@baytara.test"

    r = c.post("/api/v1/auth/register", json={
        "name": "T", "email": email, "phone": "+201000000000", "password": "secret12",
    })
    assert r.status_code == 201, r.get_json()
    access, refresh = r.get_json()["access_token"], r.get_json()["refresh_token"]

    # duplicate email rejected
    assert c.post("/api/v1/auth/register", json={
        "name": "T", "email": email, "phone": "+201000000000", "password": "secret12",
    }).status_code == 409
    # short password rejected at trust boundary
    assert c.post("/api/v1/auth/register", json={
        "name": "T", "email": "x@y.z", "phone": "+201000000000", "password": "short",
    }).status_code == 422

    # login: wrong password 401, right password ok
    assert c.post("/api/v1/auth/login", json={"email": email, "password": "nope"}).status_code == 401
    assert c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).status_code == 200

    # me requires auth
    assert c.get("/api/v1/auth/me").status_code == 401
    me = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200 and me.get_json()["user"]["email"] == email

    # refresh mints a new access token
    rf = c.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {refresh}"})
    assert rf.status_code == 200 and rf.get_json()["access_token"]

    print("auth self-check OK")


if __name__ == "__main__":
    demo()
