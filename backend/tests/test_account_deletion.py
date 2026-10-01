"""A learner closing their own account.

The stores require it (App Store 5.1.1(v), Google Play's account deletion rule). The
account is anonymised, not removed: payments and enrolments stay for the books, and
everything that identifies the person goes, including the files on disk.
"""
import os
from decimal import Decimal

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import (
    BaytarianRequest, Category, Certificate, Course, CourseReview, Enrollment,
    Notification, Payment, User, UserDevice, refresh_course_rating,
)
from app.security import hash_password
from app.services.account_deletion import DELETED_NAME, deleted_email

EMAIL, PASSWORD = "leaver@example.test", "secret12"


@pytest.fixture
def app(tmp_path):
    config = type("DeletionConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'deletion.sqlite'}",
        "TESTING": True,
        "UPLOAD_IMAGE_DIR": str(tmp_path / "uploads"),
        "BAYTARIAN_DOC_DIR": str(tmp_path / "docs"),
        "GOOGLE_OAUTH_CLIENT_IDS": ["test-client"],
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        instr = User(name="I", email="instr@example.test",
                     password_hash=hash_password(PASSWORD), role="instructor")
        admin = User(name="A", email="admin@example.test",
                     password_hash=hash_password(PASSWORD), role="admin")
        student = User(name="د. مغادر", email=EMAIL, phone="+201000000001",
                       password_hash=hash_password(PASSWORD), role="student",
                       national_id="29001011234567", is_baytarian=True, bio="bio")
        db.session.add_all([instr, admin, student])
        db.session.flush()
        cat = Category(name="C", slug="c")
        db.session.add(cat)
        db.session.flush()
        course = Course(title="Course", slug="course", instructor_id=instr.id,
                        category_id=cat.id, status="published", access_type="paid")
        db.session.add(course)
        db.session.flush()

        # the learner's footprint: files on disk and rows that point at them
        uploads = tmp_path / "uploads"
        uploads.mkdir()
        (uploads / f"u{student.id}_avatar_abcd1234.jpg").write_bytes(b"x")
        (uploads / "shared.jpg").write_bytes(b"x")
        card_dir = tmp_path / "docs" / str(student.id) / "card"
        card_dir.mkdir(parents=True)
        (card_dir / "front.jpg").write_bytes(b"x")
        nid = tmp_path / "docs" / str(student.id) / "nid_1.jpg"
        nid.write_bytes(b"x")
        student.avatar_url = f"/api/v1/uploads/u{student.id}_avatar_abcd1234.jpg"
        student.cover_url = "/api/v1/uploads/shared.jpg"   # not theirs: must survive
        student.national_id_image = str(nid)

        db.session.add_all([
            Enrollment(user_id=student.id, course_id=course.id, status="active"),
            Payment(user_id=student.id, course_id=course.id, amount=Decimal("100"),
                    status="paid", gateway="kashier"),
            CourseReview(course_id=course.id, user_id=student.id, rating=1, body="meh"),
            CourseReview(course_id=course.id, user_id=instr.id, rating=5, body="great"),
            Certificate(serial="BT-TEST000001", user_id=student.id, course_id=course.id),
            Notification(user_id=student.id, title="hi"),
            BaytarianRequest(user_id=student.id, status="approved",
                             documents=[str(card_dir / "front.jpg")]),
        ])
        db.session.flush()
        refresh_course_rating(course)
        db.session.commit()
    yield app


def signed_in(app, email=EMAIL):
    client = app.test_client()
    login = client.post("/api/v1/auth/login",
                        json={"email": email, "password": PASSWORD, "device_id": "dev-1"})
    assert login.status_code == 200, login.get_json()
    body = login.get_json()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {body['access_token']}"
    return client, body


def test_me_says_whether_a_password_is_needed(app):
    _, body = signed_in(app)
    assert body["user"]["has_password"] is True


def test_confirmation_and_password_are_required(app):
    client, _ = signed_in(app)
    r = client.delete("/api/v1/auth/account", json={"password": PASSWORD})
    assert r.status_code == 422 and r.get_json()["error"] == "confirmation_required"
    r = client.delete("/api/v1/auth/account", json={"confirm": True, "password": "wrong-one"})
    assert r.status_code == 403 and r.get_json()["error"] == "wrong_password"
    r = client.delete("/api/v1/auth/account", json={"confirm": True})
    assert r.status_code == 403
    with app.app_context():
        assert User.query.filter_by(email=EMAIL).one().deleted_at is None


def test_staff_cannot_close_their_own_account_here(app):
    for email in ("instr@example.test", "admin@example.test"):
        client, _ = signed_in(app, email)
        r = client.delete("/api/v1/auth/account", json={"confirm": True, "password": PASSWORD})
        assert r.status_code == 403 and r.get_json()["error"] == "staff_account"


def test_deletion_anonymises_and_keeps_the_books(app, tmp_path):
    client, body = signed_in(app)
    refresh = body["refresh_token"]
    r = client.delete("/api/v1/auth/account", json={"confirm": True, "password": PASSWORD})
    assert r.status_code == 200, r.get_json()

    with app.app_context():
        user = User.query.filter_by(email=deleted_email(User.query.filter_by(
            name=DELETED_NAME).one().id)).one()
        assert user.name == DELETED_NAME and user.deleted_at is not None
        assert not user.is_active and user.password_hash is None
        assert user.phone is None and user.national_id is None and user.bio is None
        assert not user.is_baytarian and user.avatar_url is None
        # the books stay
        assert Enrollment.query.filter_by(user_id=user.id).count() == 1
        assert Payment.query.filter_by(user_id=user.id).count() == 1
        # the person goes
        for model in (CourseReview, Certificate, Notification, UserDevice, BaytarianRequest):
            assert model.query.filter_by(user_id=user.id).count() == 0, model
        course = Course.query.filter_by(slug="course").one()
        assert (course.rating_count, course.rating_sum) == (1, 5)
        uid = user.id

    assert not os.path.exists(tmp_path / "uploads" / f"u{uid}_avatar_abcd1234.jpg")
    assert os.path.exists(tmp_path / "uploads" / "shared.jpg")
    assert not os.path.exists(tmp_path / "docs" / str(uid))
    assert os.path.isdir(tmp_path / "docs")

    anon = app.test_client()
    assert anon.get("/api/v1/certificates/BT-TEST000001").status_code == 404
    assert anon.post("/api/v1/auth/login",
                     json={"email": EMAIL, "password": PASSWORD}).status_code == 401
    r = anon.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {refresh}"})
    assert r.status_code == 401
    # a second request with the still-unexpired access token is refused, not repeated
    assert client.delete("/api/v1/auth/account", json={"confirm": True}).status_code == 401

    # the address is free again, as a new account with nothing attached
    r = anon.post("/api/v1/auth/register", json={
        "name": "جديد", "email": EMAIL, "password": PASSWORD, "phone": "01000000002"})
    assert r.status_code == 201, r.get_json()
    assert r.get_json()["user"]["id"] != uid


def test_admin_cannot_switch_a_closed_account_back_on(app):
    client, _ = signed_in(app)
    client.delete("/api/v1/auth/account", json={"confirm": True, "password": PASSWORD})
    admin, _ = signed_in(app, "admin@example.test")
    with app.app_context():
        uid = User.query.filter_by(name=DELETED_NAME).one().id
    r = admin.patch(f"/api/v1/admin/users/{uid}", json={"is_active": True})
    assert r.status_code == 409 and r.get_json()["error"] == "account_deleted"
    listed = admin.get("/api/v1/admin/users?q=deleted-").get_json()["users"]
    assert listed and listed[0]["deleted_at"]


def test_google_only_account_needs_only_the_confirmation(app, monkeypatch):
    monkeypatch.setattr("app.api.v1.auth.verify_id_token", lambda credential, ids: {
        "sub": "google-sub-1", "email": "g@example.test", "name": "G"})
    client = app.test_client()
    r = client.post("/api/v1/auth/google", json={"credential": "x", "device_id": "dev-g"})
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body["user"]["has_password"] is False
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {body['access_token']}"
    assert client.delete("/api/v1/auth/account", json={"confirm": True}).status_code == 200
    # signing in with the same Google account again starts a fresh, empty account
    again = app.test_client().post("/api/v1/auth/google",
                                   json={"credential": "x", "device_id": "dev-g"})
    assert again.status_code == 201 and again.get_json()["user"]["id"] != body["user"]["id"]
