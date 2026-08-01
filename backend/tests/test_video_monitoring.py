"""Playback monitoring persistence and aggregation coverage."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.exc import IntegrityError

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import (
    Category,
    Course,
    Lesson,
    User,
    UserDevice,
    VideoPlaybackEvent,
    VideoPlaybackSession,
)
from app.security import hash_password


@pytest.fixture
def monitoring_app(tmp_path):
    config = type("MonitoringConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'monitoring.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def _records():
    instructor = User(
        name="Instructor", email="monitoring-instructor@example.test",
        phone="+201000000001", password_hash=hash_password("secret12"), role="instructor",
    )
    viewer = User(
        name="Viewer", email="monitoring-viewer@example.test",
        phone="+201000000002", password_hash=hash_password("secret12"), role="student",
    )
    category = Category(name="الحيوانات الكبيرة", name_en="Large animals", slug="large-animals-monitoring")
    db.session.add_all([instructor, viewer, category])
    db.session.flush()
    course = Course(
        title="دورة الأبقار", title_en="Cattle course", slug="cattle-monitoring",
        instructor_id=instructor.id, category_id=category.id, status="published",
    )
    video = Lesson(
        title="مقدمة", title_en="Introduction", category_id=category.id,
        access_type="free", status="published", duration_minutes=2,
        vdocipher_video_id="provider-monitoring",
    )
    db.session.add_all([course, video])
    db.session.flush()
    return viewer, category, course, video


def test_playback_session_serializes_security_evidence_without_provider_secrets(monitoring_app):
    with monitoring_app.app_context():
        viewer, category, course, video = _records()
        now = datetime.now(timezone.utc)
        session = VideoPlaybackSession(
            public_id="11111111-1111-4111-8111-111111111111",
            user_id=viewer.id,
            video_id=video.id,
            course_id=course.id,
            video_title="Introduction",
            category_slug=category.slug,
            course_title="Cattle course",
            access_type="free",
            viewer_name=viewer.name,
            viewer_email=viewer.email,
            viewer_phone=viewer.phone,
            device_id="device-1",
            ip_address="203.0.113.4",
            user_agent="Browser Test",
            status="issued",
            duration_seconds=120,
            started_at=now,
            last_event_at=now,
        )
        event = VideoPlaybackEvent(
            session=session,
            client_event_id="22222222-2222-4222-8222-222222222222",
            event_type="otp_issued",
            position_seconds=0,
            watched_seconds=0,
            covered_seconds=0,
        )
        db.session.add_all([session, event])
        db.session.commit()

        payload = session.to_admin_dict(lang="en")
        assert payload["session_id"] == session.public_id
        assert payload["viewer"] == {
            "id": viewer.id,
            "name": viewer.name,
            "email": viewer.email,
            "phone": viewer.phone,
        }
        assert payload["video"] == {"id": video.id, "title": "Introduction"}
        assert payload["category"] == category.slug
        assert payload["course"] == {"id": course.id, "title": "Cattle course"}
        assert payload["security"] == {
            "device_id": "device-1",
            "ip_address": "203.0.113.4",
            "user_agent": "Browser Test",
        }
        assert payload["watched_seconds"] == 0
        assert [row["type"] for row in payload["events"]] == ["otp_issued"]
        serialized = repr(payload)
        assert "provider-monitoring" not in serialized
        assert "playbackInfo" not in serialized
        assert "otp" not in payload


def test_playback_event_client_id_is_unique_and_events_are_chronological(monitoring_app):
    with monitoring_app.app_context():
        viewer, category, course, video = _records()
        session = VideoPlaybackSession(
            public_id="33333333-3333-4333-8333-333333333333",
            user_id=viewer.id,
            video_id=video.id,
            video_title=video.title,
            category_slug=category.slug,
            course_id=course.id,
            access_type="free",
            viewer_email=viewer.email,
            viewer_phone=viewer.phone,
            device_id="device-2",
            status="playing",
        )
        db.session.add(session)
        db.session.flush()
        first = VideoPlaybackEvent(
            session_id=session.id,
            client_event_id="44444444-4444-4444-8444-444444444444",
            event_type="play",
        )
        second = VideoPlaybackEvent(
            session_id=session.id,
            client_event_id="55555555-5555-4555-8555-555555555555",
            event_type="pause",
        )
        db.session.add_all([first, second])
        db.session.commit()
        assert [event.event_type for event in session.events] == ["play", "pause"]

        db.session.add(VideoPlaybackEvent(
            session_id=session.id,
            client_event_id=first.client_event_id,
            event_type="heartbeat",
        ))
        with pytest.raises(IntegrityError):
            db.session.commit()


def _event_session(app):
    with app.app_context():
        viewer, category, course, video = _records()
        session = VideoPlaybackSession(
            public_id="66666666-6666-4666-8666-666666666666",
            user_id=viewer.id,
            video_id=video.id,
            course_id=course.id,
            video_title="Introduction",
            category_slug=category.slug,
            course_title=course.title_en,
            access_type="free",
            viewer_name=viewer.name,
            viewer_email=viewer.email,
            viewer_phone=viewer.phone,
            device_id="event-browser",
            ip_address="203.0.113.8",
            status="issued",
            duration_seconds=120,
        )
        db.session.add(session)
        db.session.commit()
        return viewer.email, session.public_id


def _event_headers(client, email, device_id="event-browser"):
    login = client.post("/api/v1/auth/login", json={
        "email": email,
        "password": "secret12",
        "device_id": device_id,
    })
    assert login.status_code == 200
    return {
        "Authorization": f"Bearer {login.get_json()['access_token']}",
        "X-Baytara-Device-ID": device_id,
    }


def _post_event(client, session_id, headers, event_id, event_type, **values):
    return client.post(
        f"/api/v1/video/playback-sessions/{session_id}/events",
        headers=headers,
        json={
            "event_id": event_id,
            "type": event_type,
            "position_seconds": values.get("position", 0),
            "watched_seconds": values.get("watched", 0),
            "covered_seconds": values.get("covered", 0),
            "duration_seconds": values.get("duration", 120),
        },
    )


def test_player_events_are_device_bound_idempotent_and_server_capped(monitoring_app):
    email, session_id = _event_session(monitoring_app)
    client = monitoring_app.test_client()
    headers = _event_headers(client, email)

    play_id = "77777777-7777-4777-8777-777777777777"
    play = _post_event(client, session_id, headers, play_id, "play")
    assert play.status_code == 200
    assert play.get_json()["session"]["status"] == "playing"

    with monitoring_app.app_context():
        session = VideoPlaybackSession.query.filter_by(public_id=session_id).one()
        session.last_event_at = datetime.now(timezone.utc) - timedelta(seconds=10)
        db.session.commit()

    heartbeat_id = "88888888-8888-4888-8888-888888888888"
    heartbeat = _post_event(
        client, session_id, headers, heartbeat_id, "heartbeat",
        position=90, watched=1000, covered=1000,
    )
    assert heartbeat.status_code == 200
    aggregate = heartbeat.get_json()["session"]
    assert 25 <= aggregate["watched_seconds"] <= 31
    assert aggregate["covered_seconds"] == aggregate["watched_seconds"]
    assert aggregate["max_position_seconds"] == 90

    duplicate = _post_event(
        client, session_id, headers, heartbeat_id, "heartbeat",
        position=120, watched=120, covered=120,
    )
    assert duplicate.status_code == 200
    assert duplicate.get_json()["session"] == aggregate
    with monitoring_app.app_context():
        assert VideoPlaybackEvent.query.filter_by(client_event_id=heartbeat_id).count() == 1

    wrong_device = _post_event(
        client, session_id, {**headers, "X-Baytara-Device-ID": "other-browser"},
        "99999999-9999-4999-8999-999999999999", "pause",
    )
    assert wrong_device.status_code == 403
    assert wrong_device.get_json() == {"error": "device_mismatch"}


def test_ended_event_completes_session_and_closed_sessions_reject_updates(monitoring_app):
    email, session_id = _event_session(monitoring_app)
    client = monitoring_app.test_client()
    headers = _event_headers(client, email)
    with monitoring_app.app_context():
        session = VideoPlaybackSession.query.filter_by(public_id=session_id).one()
        session.last_event_at = datetime.now(timezone.utc) - timedelta(seconds=60)
        db.session.commit()

    ended = _post_event(
        client, session_id, headers,
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "ended",
        position=120, watched=120, covered=120,
    )
    assert ended.status_code == 200
    assert ended.get_json()["session"] == {
        **ended.get_json()["session"],
        "status": "completed",
        "watched_seconds": 120,
        "covered_seconds": 120,
        "completion_percent": 100,
    }

    rejected = _post_event(
        client, session_id, headers,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "heartbeat",
        position=120, watched=120, covered=120,
    )
    assert rejected.status_code == 409
    assert rejected.get_json() == {"error": "session_closed"}

    invalid = _post_event(
        client, "missing-session", headers,
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "download",
    )
    assert invalid.status_code in {404, 422}
