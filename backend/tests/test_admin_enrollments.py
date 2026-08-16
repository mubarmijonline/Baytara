"""Admin enrollment listing and un-enrollment, with the recorded refund.

Run directly with ``python -m tests.test_admin_enrollments`` or collect with pytest.
"""
from pathlib import Path

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, CourseVideo, Enrollment, Notification, Payment, User
from app.security import hash_password


@pytest.fixture
def app(tmp_path):
    config = type("AdminEnrollmentsConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'admin-enrollments.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def seeded(app):
    with app.app_context():
        admin = User(name="Admin", email="admin-enr@example.test",
                     password_hash=hash_password("secret12"), role="admin")
        instructor = User(name="Instructor", email="ins-enr@example.test",
                          password_hash="hash", role="instructor")
        learner = User(name="Learner", email="learner-enr@example.test",
                       password_hash="hash", role="student")
        category = Category(name="Equine", slug="equine-enr")
        db.session.add_all([admin, instructor, learner, category])
        db.session.flush()
        course = Course(title="Paid course", slug="paid-course-enr", price=400, currency="EGP",
                        instructor_id=instructor.id, category_id=category.id,
                        status="published", access_type="general", enrolled_count=1)
        db.session.add(course)
        db.session.flush()
        db.session.add_all([
            Enrollment(user_id=learner.id, course_id=course.id, source="purchase", status="active"),
            Payment(user_id=learner.id, kind="enroll", course_id=course.id,
                    amount=400, currency="EGP", status="paid"),
        ])
        db.session.commit()
        return {"course": course.id, "learner": learner.id}


@pytest.fixture
def admin_client(app, seeded):
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "admin-enr@example.test", "password": "secret12",
    })
    assert login.status_code == 200, login.get_json()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    return client


def _only(client, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    body = client.get(f"/api/v1/admin/enrollments?{query}").get_json()
    return body["enrollments"]


def test_listing_shows_the_learner_course_and_the_paid_seat(admin_client, seeded):
    rows = _only(admin_client, course_id=seeded["course"])
    assert len(rows) == 1
    row = rows[0]
    assert row["learner"]["email"] == "learner-enr@example.test"
    assert row["course"]["title"] == "Paid course"
    assert row["status"] == "active" and row["source"] == "purchase"
    assert row["payment"]["amount"] == 400 and row["payment"]["status"] == "paid"

    # searchable by learner and by course, and filterable by status
    assert _only(admin_client, q="learner-enr")
    assert _only(admin_client, q="Paid+course")
    assert _only(admin_client, status="active")
    assert _only(admin_client, status="cancelled") == []


def test_unenroll_requires_a_reason_and_tells_the_learner(admin_client, seeded, app):
    rows = _only(admin_client, course_id=seeded["course"])
    eid = rows[0]["id"]

    blank = admin_client.post(f"/api/v1/admin/enrollments/{eid}/cancel", json={"reason": "   "})
    assert blank.status_code == 422 and blank.get_json()["error"] == "reason_required"

    done = admin_client.post(f"/api/v1/admin/enrollments/{eid}/cancel",
                             json={"reason": "Duplicate purchase"})
    assert done.status_code == 200, done.get_json()
    assert done.get_json()["enrollment"]["status"] == "cancelled"
    assert done.get_json()["enrollment"]["cancel_reason"] == "Duplicate purchase"

    with app.app_context():
        # access is gone, the course card stops counting them, and the reason reaches them
        assert Enrollment.query.get(rows[0]["id"]).has_access() is False
        assert db.session.get(Course, seeded["course"]).enrolled_count == 0
        note = Notification.query.filter_by(user_id=seeded["learner"]).first()
        assert note and note.body == "Duplicate purchase", note

    # cancelling twice is refused rather than double-decrementing the counter
    again = admin_client.post(f"/api/v1/admin/enrollments/{eid}/cancel", json={"reason": "again"})
    assert again.status_code == 409
    with app.app_context():
        assert db.session.get(Course, seeded["course"]).enrolled_count == 0


def test_refund_is_recorded_against_the_payment(admin_client, seeded, app):
    eid = _only(admin_client, course_id=seeded["course"])[0]["id"]

    over = admin_client.post(f"/api/v1/admin/enrollments/{eid}/cancel",
                             json={"reason": "x", "refund": {"amount": 500}})
    assert over.status_code == 422 and over.get_json()["error"] == "refund_exceeds_payment"
    bad_percent = admin_client.post(f"/api/v1/admin/enrollments/{eid}/cancel",
                                    json={"reason": "x", "refund": {"percent": 150}})
    assert bad_percent.status_code == 422

    # 25% of 400 = 100, so the seat is only partly given back
    partial = admin_client.post(f"/api/v1/admin/enrollments/{eid}/cancel",
                                json={"reason": "Left after one lesson", "refund": {"percent": 25}})
    assert partial.status_code == 200, partial.get_json()
    payment = partial.get_json()["enrollment"]["payment"]
    assert payment["refunded_amount"] == 100
    assert payment["status"] == "partially_refunded"
    assert payment["refund_reason"] == "Left after one lesson"

    with app.app_context():
        # revenue nets the refund off rather than dropping the whole sale
        stats = admin_client.get("/api/v1/admin/stats").get_json()
        assert stats["payments"]["revenue"] == 300
        assert stats["payments"]["refunded"] == 100


def test_a_full_refund_marks_the_payment_refunded(admin_client, seeded):
    eid = _only(admin_client, course_id=seeded["course"])[0]["id"]
    done = admin_client.post(f"/api/v1/admin/enrollments/{eid}/cancel",
                             json={"reason": "Charged twice", "refund": {"percent": 100}})
    assert done.status_code == 200
    assert done.get_json()["enrollment"]["payment"]["status"] == "refunded"
    assert admin_client.get("/api/v1/admin/stats").get_json()["payments"]["revenue"] == 0


def demo():
    print("run with pytest: python -m pytest tests/test_admin_enrollments.py -q")


if __name__ == "__main__":
    demo()


def test_a_free_course_records_no_enrollment_and_never_blocks_a_delete(app):
    """A course with no fee is watched, not joined. Nothing is recorded, so nothing
    is left behind to keep the course or its instructor alive."""
    from app.models import Lesson
    from app.services.catalog_access import video_access

    with app.app_context():
        instructor = User(name="Free instructor", email="free-ins@example.test",
                          password_hash="hash", role="instructor")
        learner = User(name="Watcher", email="watcher@example.test",
                       password_hash=hash_password("secret12"), role="student")
        admin = User(name="Admin2", email="admin-free@example.test",
                     password_hash=hash_password("secret12"), role="admin")
        db.session.add_all([instructor, learner, admin])
        db.session.flush()
        course = Course(title="Open course", slug="open-course-enr", price=0,
                        instructor_id=instructor.id, status="published", access_type="free")
        db.session.add(course)
        db.session.flush()
        video = Lesson(title="Open lesson", position=0, access_type="free", status="published",
                       instructor_id=instructor.id, vdocipher_video_id="vid-open")
        db.session.add(video)
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=video.id, position=0))
        db.session.commit()
        course_id, learner_id, instructor_id, video_id = course.id, learner.id, instructor.id, video.id

    client = app.test_client()
    token = client.post("/api/v1/auth/login", json={
        "email": "watcher@example.test", "password": "secret12"}).get_json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Asking to enrol is answered, but nothing is written down.
    joined = client.post("/api/v1/enrollments", headers=headers, json={"course_id": course_id})
    assert joined.status_code == 200, joined.get_json()
    assert joined.get_json() == {"enrollment": None, "free": True}
    with app.app_context():
        assert Enrollment.query.filter_by(course_id=course_id).count() == 0
        # ...and the lesson still plays, which is the whole point.
        allowed, reason = video_access(db.session.get(User, learner_id), db.session.get(Lesson, video_id))
        assert allowed and reason is None, reason

    admin_client = app.test_client()
    admin_token = admin_client.post("/api/v1/auth/login", json={
        "email": "admin-free@example.test", "password": "secret12"}).get_json()["access_token"]
    admin_client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {admin_token}"

    # A free video is released rather than defended: it stops blocking the instructor
    # and is handed to nobody. The course still blocks — its FK cannot be null.
    blocked = admin_client.delete(f"/api/v1/admin/users/{instructor_id}")
    assert blocked.status_code == 409 and blocked.get_json()["videos"] == 0

    assert admin_client.delete(f"/api/v1/admin/courses/{course_id}").status_code == 200
    assert admin_client.delete(f"/api/v1/admin/users/{instructor_id}").status_code == 200
    with app.app_context():
        assert db.session.get(Lesson, video_id).instructor_id is None
