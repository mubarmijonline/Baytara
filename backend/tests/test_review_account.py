"""`flask create-review-account`: the App Store / Google Play reviewers' account.

The account has to sign in on several devices, open every course its audience allows,
and not be locked out of playback by the suspicious-activity guard. Running the command
again must bring it back to the same state rather than stack rows.
"""
import uuid

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import (
    BaytarianRequest, Course, CourseVideo, Enrollment, Lesson, Payment, User,
    VideoPlaybackEvent, VideoPlaybackSession,
)
from app.security import hash_password, verify_password

EMAIL = "review@example.test"
PASSWORD = "review-secret-1"
ARGS = ["create-review-account", " Review@Example.test ", "Store Review", "01012345678"]
PROMPT = f"{PASSWORD}\n{PASSWORD}\n"


@pytest.fixture
def app(tmp_path):
    config = type("ReviewAccountConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'review.sqlite'}",
        "TESTING": True,
    })
    application = create_app(config)
    with application.app_context():
        db.create_all()
        instructor = User(name="I", email="instructor@example.test",
                          password_hash=hash_password("secret12"), role="instructor")
        db.session.add(instructor)
        db.session.flush()
        for access_type, price in (("free", 0), ("vet_free", 0), ("baytarian", 300), ("general", 200)):
            db.session.add(Course(title=access_type, slug=access_type, instructor_id=instructor.id,
                                  access_type=access_type, price=price, status="published",
                                  access_days=30))
        # Not published: never offered.
        db.session.add(Course(title="draft", slug="draft", instructor_id=instructor.id,
                              access_type="free", status="draft"))
        db.session.commit()
        yield application
        db.session.remove()
        db.drop_all()


def _run(app, *extra, apply=True):
    args = ARGS + list(extra) + (["--apply"] if apply else [])
    return app.test_cli_runner().invoke(args=args, input=PROMPT if apply else None)


def _seats(user_id):
    return {e.course.slug: e for e in Enrollment.query.filter_by(user_id=user_id).all()}


def test_dry_run_changes_nothing(app):
    result = _run(app, apply=False)
    assert result.exit_code == 0, result.output
    assert "DRY RUN" in result.output and "enrolled" in result.output
    with app.app_context():
        assert User.query.filter_by(email=EMAIL).first() is None
        assert Enrollment.query.count() == 0 and BaytarianRequest.query.count() == 0


def test_creates_a_verified_student_with_lifetime_seats(app):
    result = _run(app)
    assert result.exit_code == 0, result.output
    assert "created" in result.output
    with app.app_context():
        user = User.query.filter_by(email=EMAIL).one()
        assert user.role == "student" and user.is_active and user.deleted_at is None
        assert user.is_review_account is True and user.max_devices == 10
        assert user.phone == "+201012345678"
        assert verify_password(user.password_hash, PASSWORD)
        assert user.is_baytarian is True
        request = BaytarianRequest.query.filter_by(user_id=user.id).one()
        assert request.status == "approved" and request.route == "admin"

        seats = _seats(user.id)
        # --vet: everything a vet may open, and not the course sold to non-vets
        assert set(seats) == {"free", "vet_free", "baytarian"}
        assert seats["free"].source == seats["vet_free"].source == "free"
        assert seats["baytarian"].source == "admin_grant"
        assert all(s.status == "active" and s.expires_at is None for s in seats.values())
        assert Course.query.filter_by(slug="baytarian").one().enrolled_count == 1
        assert Payment.query.count() == 0
    assert "skipped (non_veterinarians_only)" in result.output


def test_second_run_is_idempotent(app):
    assert _run(app).exit_code == 0
    again = _run(app)
    assert again.exit_code == 0, again.output
    assert "updated" in again.output and "already enrolled" in again.output
    with app.app_context():
        assert User.query.filter_by(email=EMAIL).count() == 1
        uid = User.query.filter_by(email=EMAIL).one().id
        assert Enrollment.query.filter_by(user_id=uid).count() == 3
        assert BaytarianRequest.query.filter_by(user_id=uid).count() == 1
        assert {c.slug: c.enrolled_count for c in Course.query.all()} == {
            "free": 1, "vet_free": 1, "baytarian": 1, "general": 0, "draft": 0,
        }


def test_no_vet_opens_general_and_skips_vet_courses(app):
    result = _run(app, "--no-vet", "--max-devices", "4")
    assert result.exit_code == 0, result.output
    with app.app_context():
        user = User.query.filter_by(email=EMAIL).one()
        assert user.is_baytarian is False and user.max_devices == 4
        seats = _seats(user.id)
        assert set(seats) == {"free", "general"}
        assert seats["general"].source == "admin_grant" and seats["general"].expires_at is None
    assert result.output.count("skipped (needs_baytarian)") == 2


def test_never_makes_or_demotes_an_admin(app):
    with app.app_context():
        db.session.add(User(name="Owner", email=EMAIL, role="admin",
                            password_hash=hash_password("owner-secret")))
        db.session.commit()
    result = _run(app)
    assert result.exit_code != 0
    assert "admin account" in result.output
    with app.app_context():
        owner = User.query.filter_by(email=EMAIL).one()
        assert owner.role == "admin" and not owner.is_review_account
        assert verify_password(owner.password_hash, "owner-secret")


def test_refuses_an_invalid_phone(app):
    result = app.test_cli_runner().invoke(
        args=["create-review-account", EMAIL, "Store Review", "12345", "--apply"], input=PROMPT)
    assert result.exit_code != 0
    assert "not a mobile number" in result.output
    with app.app_context():
        assert User.query.filter_by(email=EMAIL).first() is None


@pytest.fixture
def playback(app, monkeypatch):
    import app.api.v1.video as video_api

    class FakeProvider:
        def issue_otp(self, video_id, annotate=None, ttl=300, **rules):
            return {"otp": "otp", "playbackInfo": "info"}

    monkeypatch.setattr(video_api, "provider", FakeProvider())
    with app.app_context():
        course = Course.query.filter_by(slug="general").one()
        lesson = Lesson(title="Paid", status="published", access_type="general", price=50,
                        vdocipher_video_id="paid-video")
        db.session.add(lesson)
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=lesson.id, position=0))
        for email, review in (("normal@example.test", False), ("store@example.test", True)):
            user = User(name=email, email=email, phone="+201000000011", role="student",
                        password_hash=hash_password("secret12"), is_review_account=review)
            db.session.add(user)
            db.session.flush()
            db.session.add(Enrollment(user_id=user.id, course_id=course.id, status="active"))
            session = VideoPlaybackSession(public_id=str(uuid.uuid4()), user_id=user.id,
                                           video_id=lesson.id, status="completed")
            db.session.add(session)
            db.session.flush()
            for _ in range(3):
                db.session.add(VideoPlaybackEvent(session_id=session.id, event_type="suspicious",
                                                  client_event_id=str(uuid.uuid4())))
        db.session.commit()
        return lesson.id


def _play(client, email, lesson_id):
    device_id = "device-" + email.split("@", 1)[0]
    token = client.post("/api/v1/auth/login", json={
        "email": email, "password": "secret12", "device_id": device_id,
    }).get_json()["access_token"]
    return client.post("/api/v1/video/playback", json={"lesson_id": lesson_id}, headers={
        "Authorization": f"Bearer {token}", "X-Baytara-Device-ID": device_id,
    })


def test_review_account_is_not_blocked_after_suspicious_events(app, playback):
    client = app.test_client()
    normal = _play(client, "normal@example.test", playback)
    assert normal.status_code == 403 and normal.get_json()["error"] == "suspicious_activity"
    review = _play(client, "store@example.test", playback)
    assert review.status_code == 200, review.get_json()
    with app.app_context():
        # still on record
        assert VideoPlaybackEvent.query.filter_by(event_type="suspicious").count() == 6
