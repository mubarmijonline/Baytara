"""An admin opening a paid course to chosen people without payment (milestone 28).

The client's use: influencers and reviewers get the course free, can watch and review
it, and the course stops advertising zero learners.
"""
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import (
    Category, Course, CourseVideo, Enrollment, Lesson, Notification, Payment, User,
)
from app.security import hash_password
from app.services.catalog_access import video_access

PASSWORD = "secret12"


@pytest.fixture
def app(tmp_path):
    config = type("GrantConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'grants.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        instr = User(name="I", email="instr@example.test", password_hash=hash_password(PASSWORD),
                     role="instructor")
        admin = User(name="A", email="admin@example.test", password_hash=hash_password(PASSWORD),
                     role="admin")
        vets = [User(name=f"Vet {n}", email=f"vet{n}@example.test", phone="+201000000001",
                     password_hash=hash_password(PASSWORD), role="student", is_baytarian=True)
                for n in range(3)]
        plain = User(name="Plain", email="plain@example.test", password_hash=hash_password(PASSWORD),
                     role="student")
        db.session.add_all([instr, admin, plain, *vets])
        db.session.flush()
        cat = Category(name="C", slug="c")
        db.session.add(cat)
        db.session.flush()
        paid = Course(title="Ultrasound", slug="paid", instructor_id=instr.id, category_id=cat.id,
                      status="published", access_type="baytarian", price=Decimal("990"),
                      access_days=180)
        free = Course(title="Free", slug="free", instructor_id=instr.id, category_id=cat.id,
                      status="published", access_type="free")
        db.session.add_all([paid, free])
        db.session.flush()
        preview = Lesson(title="Preview", position=0, access_type="free", status="published")
        locked = Lesson(title="Locked", position=1, access_type="baytarian", price=Decimal("990"),
                        status="published")
        db.session.add_all([preview, locked])
        db.session.flush()
        db.session.add_all([CourseVideo(course_id=paid.id, video_id=preview.id, position=0),
                            CourseVideo(course_id=paid.id, video_id=locked.id, position=1)])
        db.session.commit()
    yield app


def ids(app):
    with app.app_context():
        return {u.email.split("@")[0]: u.id for u in User.query.all()} | {
            "paid": Course.query.filter_by(slug="paid").one().id,
            "free": Course.query.filter_by(slug="free").one().id,
            "locked": Lesson.query.filter_by(title="Locked").one().id,
            "preview": Lesson.query.filter_by(title="Preview").one().id,
        }


def signed_in(app, email):
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD,
                                                    "device_id": f"dev-{email}"})
    assert login.status_code == 200, login.get_json()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    return client


def test_the_lock_the_client_asked_for_is_already_there(app):
    """Preview plays for anyone allowed in; the paid lesson does not until a seat exists."""
    i = ids(app)
    with app.app_context():
        vet = db.session.get(User, i["vet0"])
        assert video_access(vet, db.session.get(Lesson, i["preview"])) == (True, None)
        assert video_access(vet, db.session.get(Lesson, i["locked"])) == (False, "not_entitled")
        admin = db.session.get(User, i["admin"])
        # what the client saw: an admin passes every lock
        assert video_access(admin, db.session.get(Lesson, i["locked"])) == (True, None)


def test_grant_opens_the_course_counts_the_learner_and_notifies(app):
    i = ids(app)
    admin = signed_in(app, "admin@example.test")
    r = admin.post(f"/api/v1/admin/courses/{i['paid']}/grants",
                   json={"user_ids": [i["vet0"], i["vet1"], i["vet2"]]})
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert [g["user_id"] for g in body["granted"]] == [i["vet0"], i["vet1"], i["vet2"]]
    assert body["skipped"] == [] and body["enrolled_count"] == 3

    with app.app_context():
        e = Enrollment.query.filter_by(user_id=i["vet0"], course_id=i["paid"]).one()
        assert e.source == "admin_grant" and e.has_access()
        # the course's own window, as a buyer gets
        assert e.expires_at is not None
        assert Payment.query.count() == 0
        assert Notification.query.filter_by(user_id=i["vet0"]).count() == 1
        vet = db.session.get(User, i["vet0"])
        assert video_access(vet, db.session.get(Lesson, i["locked"])) == (True, None)

    # the public card shows the learners
    assert app.test_client().get("/api/v1/courses/paid").get_json()["course"]["enrolled_count"] == 3


def test_a_granted_learner_can_review(app):
    i = ids(app)
    signed_in(app, "admin@example.test").post(
        f"/api/v1/admin/courses/{i['paid']}/grants", json={"user_ids": [i["vet0"]]})
    vet = signed_in(app, "vet0@example.test")
    r = vet.post("/api/v1/courses/paid/reviews", json={"rating": 5, "body": "ممتاز"})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["reviews_count"] == 1


def test_lifetime_and_repeat_and_skips(app):
    i = ids(app)
    admin = signed_in(app, "admin@example.test")
    url = f"/api/v1/admin/courses/{i['paid']}/grants"
    r = admin.post(url, json={"user_ids": [i["vet0"]], "access": "lifetime"})
    with app.app_context():
        assert Enrollment.query.filter_by(user_id=i["vet0"]).one().expires_at is None

    r = admin.post(url, json={"user_ids": [i["vet0"], i["plain"], 99999, i["vet1"], i["vet1"]]})
    body = r.get_json()
    reasons = {s["user_id"]: s["reason"] for s in body["skipped"]}
    assert reasons == {i["vet0"]: "already_enrolled", i["plain"]: "needs_baytarian",
                       99999: "user_unavailable"}
    assert [g["user_id"] for g in body["granted"]] == [i["vet1"]]
    assert body["enrolled_count"] == 2


def test_a_cancelled_or_lapsed_seat_comes_back(app):
    i = ids(app)
    admin = signed_in(app, "admin@example.test")
    url = f"/api/v1/admin/courses/{i['paid']}/grants"
    admin.post(url, json={"user_ids": [i["vet0"], i["vet1"]]})
    with app.app_context():
        e = Enrollment.query.filter_by(user_id=i["vet0"]).one()
        eid = e.id
        lapsed = Enrollment.query.filter_by(user_id=i["vet1"]).one()
        lapsed.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        db.session.commit()
    assert admin.post(f"/api/v1/admin/enrollments/{eid}/cancel",
                      json={"reason": "test"}).status_code == 200

    body = admin.post(url, json={"user_ids": [i["vet0"], i["vet1"]]}).get_json()
    assert len(body["granted"]) == 2
    # cancelled came back onto the counter; lapsed was never off it
    assert body["enrolled_count"] == 2
    with app.app_context():
        assert all(e.has_access() for e in Enrollment.query.all())


def test_refusals(app):
    i = ids(app)
    admin = signed_in(app, "admin@example.test")
    assert admin.post(f"/api/v1/admin/courses/{i['free']}/grants",
                      json={"user_ids": [i["vet0"]]}).status_code == 409
    url = f"/api/v1/admin/courses/{i['paid']}/grants"
    assert admin.post(url, json={"user_ids": []}).status_code == 422
    assert admin.post(url, json={"user_ids": ["1"]}).status_code == 422
    assert admin.post(url, json={"user_ids": [i["vet0"]], "access": "forever"}).status_code == 422
    assert admin.post(url, json={"user_ids": list(range(1, 202))}).status_code == 422
    assert admin.post("/api/v1/admin/courses/99999/grants",
                      json={"user_ids": [i["vet0"]]}).status_code == 404
    student = signed_in(app, "vet0@example.test")
    assert student.post(url, json={"user_ids": [i["vet0"]]}).status_code == 403
