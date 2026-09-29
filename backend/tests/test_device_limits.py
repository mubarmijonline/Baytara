"""The three sharing limits the client asked us to re-confirm, in one place.

Two machines per account, a third refused, and one stream at a time. Each is enforced
twice -- once at sign-in, and again on every single playback request -- because a token
minted before a device was removed must not outlive it.
"""
import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Lesson, User, UserDevice, VideoPlaybackSession
from app.security import hash_password

PASSWORD = "secret12"
EMAIL = "device-limits@example.test"


@pytest.fixture
def app(tmp_path, monkeypatch):
    config = type("DeviceLimitConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'devices.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)

    class FakeProvider:
        def issue_otp(self, video_id, annotate=None, ttl=300, **rules):
            return {"otp": f"otp-{video_id}", "playbackInfo": "info"}

    import app.api.v1.video as video_api
    monkeypatch.setattr(video_api, "provider", FakeProvider())

    with app.app_context():
        db.create_all()
        user = User(name="Viewer", email=EMAIL, phone="+201000000009",
                    password_hash=hash_password(PASSWORD), role="student")
        category = Category(name="Cat", slug="cat-devices")
        db.session.add_all([user, category])
        db.session.flush()
        lesson = Lesson(title="Free lesson", position=0, status="published", access_type="free",
                        category_id=category.id, vdocipher_video_id="devices-video")
        db.session.add(lesson)
        db.session.commit()
        app.config["LESSON_ID"] = lesson.id
        yield app
        db.session.remove()


def login(client, device_id, group=None):
    # The machine signature travels as a header (X-Baytara-Device-Group), not in the body:
    # browsers cannot share storage, so each generates its own device id and reports the
    # machine separately. A client that sends nothing stands alone, as old builds did.
    return client.post("/api/v1/auth/login",
                       json={"email": EMAIL, "password": PASSWORD, "device_id": device_id},
                       headers={"X-Baytara-Device-Group": group or device_id})


def headers(client, device_id, group=None):
    response = login(client, device_id, group)
    assert response.status_code == 200, response.get_json()
    return {"Authorization": f"Bearer {response.get_json()['access_token']}",
            "X-Baytara-Device-ID": device_id}


def play(client, hdrs, app):
    return client.post("/api/v1/video/playback", headers=hdrs,
                       json={"lesson_id": app.config["LESSON_ID"]})


def test_two_machines_allowed_and_a_third_refused_at_sign_in(app):
    client = app.test_client()
    assert login(client, "machine-1").status_code == 200
    assert login(client, "machine-2").status_code == 200

    third = login(client, "machine-3")
    assert third.status_code == 403
    body = third.get_json()
    assert body["error"] == "device_limit_reached"
    # the refusal names the machines so the viewer can free a slot themselves
    assert body["max_devices"] == 2
    assert len(body["devices"]) == 2


def test_several_browsers_on_one_machine_are_one_device(app):
    """The limit counts machines. Chrome and Firefox on one laptop share a signature, so
    a second browser is not a second device -- that was the fix of 2026-09-06."""
    client = app.test_client()
    assert login(client, "laptop-chrome", group="laptop").status_code == 200
    assert login(client, "laptop-firefox", group="laptop").status_code == 200
    assert login(client, "phone", group="phone").status_code == 200
    # three browsers, two machines, still within the cap
    with app.app_context():
        user = User.query.filter_by(email=EMAIL).one()
        assert len(UserDevice.groups_for(user.id)) == 2


def test_removing_a_machine_frees_the_slot(app):
    client = app.test_client()
    first = headers(client, "machine-1")
    login(client, "machine-2")
    assert login(client, "machine-3").status_code == 403

    with app.app_context():
        user = User.query.filter_by(email=EMAIL).one()
        device = UserDevice.query.filter_by(user_id=user.id, device_id="machine-2").one()
        removed = client.delete(f"/api/v1/auth/devices/{device.id}", headers=first)
        assert removed.status_code in (200, 204), removed.get_json()

    assert login(client, "machine-3").status_code == 200


def test_playback_re_checks_the_limit_rather_than_trusting_the_token(app):
    """A token minted while the account was inside the cap must not keep working after a
    third machine is added behind it."""
    client = app.test_client()
    hdrs = headers(client, "machine-1")
    assert play(client, hdrs, app).status_code == 200

    with app.app_context():
        user = User.query.filter_by(email=EMAIL).one()
        db.session.add_all([
            UserDevice(user_id=user.id, device_id="extra-a", device_group="extra-a"),
            UserDevice(user_id=user.id, device_id="extra-b", device_group="extra-b"),
        ])
        db.session.commit()

    refused = play(client, hdrs, app)
    assert refused.status_code == 403
    assert refused.get_json()["error"] == "device_limit_reached"


def test_a_token_only_works_from_the_device_it_was_issued_to(app):
    client = app.test_client()
    hdrs = headers(client, "machine-1")
    moved = client.post("/api/v1/video/playback",
                        headers={**hdrs, "X-Baytara-Device-ID": "machine-2"},
                        json={"lesson_id": app.config["LESSON_ID"]})
    assert moved.status_code == 403
    assert moved.get_json()["error"] == "device_mismatch"


def test_one_stream_at_a_time_across_the_two_allowed_machines(app):
    """Both machines are legitimate; watching on both at once is not."""
    client = app.test_client()
    first = headers(client, "machine-1")
    second = headers(client, "machine-2")

    assert play(client, first, app).status_code == 200
    blocked = play(client, second, app)
    assert blocked.status_code == 409
    assert blocked.get_json()["error"] == "already_playing"


def test_the_same_machine_reloading_is_not_a_second_stream(app):
    client = app.test_client()
    hdrs = headers(client, "machine-1")
    assert play(client, hdrs, app).status_code == 200
    # a refresh, a seek, a lesson change: same device, still one stream
    assert play(client, hdrs, app).status_code == 200


def test_the_second_machine_may_play_once_the_first_session_ends(app):
    client = app.test_client()
    first = headers(client, "machine-1")
    second = headers(client, "machine-2")

    started = play(client, first, app)
    assert started.status_code == 200
    with app.app_context():
        session = VideoPlaybackSession.query.filter_by(
            public_id=started.get_json()["session_id"]).one()
        session.status = "completed"
        db.session.commit()

    assert play(client, second, app).status_code == 200
