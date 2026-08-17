"""Admin verifying an account with no document at all.

The point of the endpoint is that the grant stays visible and reversible: it lands in
the same queue as every other approval, on the `admin` route.
"""
import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import BaytarianRequest, Notification, User
from app.security import hash_password


@pytest.fixture
def app(tmp_path):
    config = type("DirectVerifyConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'verify.sqlite'}",
        "TESTING": True,
    })
    application = create_app(config)
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


def _headers(client, app, email, role):
    with app.app_context():
        db.session.add(User(name="U", email=email, phone="+201000000000",
                            password_hash=hash_password("secret12"), role=role))
        db.session.commit()
    token = client.post("/api/v1/auth/login", json={
        "email": email, "password": "secret12",
    }).get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_admin_verifies_a_user_with_no_document(app):
    client = app.test_client()
    admin = _headers(client, app, "adm@t.test", "admin")
    _headers(client, app, "vet@t.test", "student")
    with app.app_context():
        uid = User.query.filter_by(email="vet@t.test").one().id

    created = client.post(f"/api/v1/admin/users/{uid}/verify", headers=admin, json={"grant": "baytarian"})
    assert created.status_code == 201
    body = created.get_json()["request"]
    assert body["route"] == "admin" and body["status"] == "approved" and body["documents_count"] == 0

    with app.app_context():
        user = db.session.get(User, uid)
        assert user.is_baytarian is True and user.is_vet_student is False
        row = BaytarianRequest.query.filter_by(user_id=uid).one()
        assert row.auto_approved is False and row.reviewed_by is not None
        # The user is told, like any other approval.
        assert Notification.query.filter_by(user_id=uid, type="baytarian_approved").count() == 1

    # Verifying twice is a mistake, not an idempotent no-op: it would stack queue rows.
    assert client.post(f"/api/v1/admin/users/{uid}/verify", headers=admin, json={}).status_code == 409

    # Revoke works on it exactly like on a document-backed approval.
    revoked = client.post(f"/api/v1/admin/baytarian-requests/{body['id']}/revoke",
                          headers=admin, json={"reason": "granted by mistake"})
    assert revoked.status_code == 200
    with app.app_context():
        assert db.session.get(User, uid).is_baytarian is False


def test_direct_verify_is_admin_only_and_validates_the_grant(app):
    client = app.test_client()
    admin = _headers(client, app, "adm2@t.test", "admin")
    student = _headers(client, app, "s2@t.test", "student")
    with app.app_context():
        uid = User.query.filter_by(email="s2@t.test").one().id

    assert client.post(f"/api/v1/admin/users/{uid}/verify", headers=student, json={}).status_code == 403
    assert client.post(f"/api/v1/admin/users/{uid}/verify", headers=admin,
                       json={"grant": "superuser"}).status_code == 400
    assert client.post("/api/v1/admin/users/999999/verify", headers=admin, json={}).status_code == 404

    student_grant = client.post(f"/api/v1/admin/users/{uid}/verify", headers=admin, json={"grant": "vet_student"})
    assert student_grant.status_code == 201
    with app.app_context():
        user = db.session.get(User, uid)
        assert user.is_baytarian is True and user.is_vet_student is True
