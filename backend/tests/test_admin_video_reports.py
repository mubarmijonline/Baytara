import csv
import io
from datetime import datetime, timedelta, timezone

import pytest
from flask_jwt_extended import create_access_token

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import (
    Category,
    Course,
    Lesson,
    User,
    VideoPlaybackEvent,
    VideoPlaybackSession,
)
from app.security import hash_password


NOW = datetime(2026, 8, 1, 17, 0, tzinfo=timezone.utc)
PASSWORD_HASH = hash_password("secret12")


@pytest.fixture
def app(tmp_path):
    config = type("VideoReportConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'video-reports.sqlite'}",
        "TESTING": True,
    })
    application = create_app(config)
    with application.app_context():
        db.create_all()
        admin = User(name="Admin", email="reports-admin@example.test", password_hash=PASSWORD_HASH, role="admin")
        viewer = User(name="=Viewer One", email="viewer-one@example.test", phone="+201000000001", password_hash=PASSWORD_HASH)
        second = User(name="Viewer Two", email="viewer-two@example.test", phone="+201000000002", password_hash=PASSWORD_HASH)
        instructor = User(name="Instructor", email="reports-instructor@example.test", password_hash=PASSWORD_HASH, role="instructor")
        large = Category(name="Large", name_en="Large", slug="large-animals")
        equine = Category(name="Equine", name_en="Equine", slug="equine")
        db.session.add_all([admin, viewer, second, instructor, large, equine])
        db.session.flush()
        course = Course(title="Cattle Course", slug="cattle-course", instructor_id=instructor.id, category_id=large.id)
        db.session.add(course)
        db.session.flush()
        intro = Lesson(title="Introduction", category_id=large.id, access_type="free", status="published")
        paid = Lesson(title="Advanced Equine", category_id=equine.id, access_type="general", status="published")
        db.session.add_all([intro, paid])
        db.session.flush()

        playing = _session(
            "11111111-1111-4111-8111-111111111111", viewer, intro,
            status="playing", started_at=NOW - timedelta(seconds=20), last_event_at=NOW - timedelta(seconds=10),
            watched_seconds=30, covered_seconds=30, duration_seconds=60, completion_percent=50,
            device_id="browser-one", ip_address="203.0.113.10",
        )
        completed = _session(
            "22222222-2222-4222-8222-222222222222", second, intro,
            course=course, status="completed", started_at=NOW - timedelta(days=1),
            last_event_at=NOW - timedelta(days=1), watched_seconds=60, covered_seconds=60,
            duration_seconds=60, completion_percent=100, device_id="browser-two", ip_address="203.0.113.20",
        )
        denied = _session(
            "33333333-3333-4333-8333-333333333333", viewer, paid,
            status="denied", reason="audience_required", started_at=NOW - timedelta(days=2),
            last_event_at=NOW - timedelta(days=2), device_id="browser-one", ip_address="203.0.113.10",
        )
        failed = _session(
            "44444444-4444-4444-8444-444444444444", second, paid,
            status="provider_failed", reason="provider_error", started_at=NOW - timedelta(days=3),
            last_event_at=NOW - timedelta(days=3), device_id="browser-two", ip_address="203.0.113.20",
        )
        db.session.add_all([playing, completed, denied, failed])
        db.session.flush()
        db.session.add_all([
            VideoPlaybackEvent(
                session=playing, client_event_id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                event_type="otp_issued", created_at=NOW - timedelta(seconds=20),
            ),
            VideoPlaybackEvent(
                session=playing, client_event_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                event_type="play", position_seconds=0, watched_seconds=0, covered_seconds=0,
                created_at=NOW - timedelta(seconds=15),
            ),
        ])
        db.session.commit()
        yield application
        db.session.remove()
        db.drop_all()


def _session(public_id, user, video, *, course=None, **values):
    return VideoPlaybackSession(
        public_id=public_id,
        user_id=user.id,
        video_id=video.id,
        course_id=course.id if course else None,
        video_title=video.title,
        category_slug=video.category.slug,
        course_title=course.title if course else None,
        access_type=video.access_type,
        viewer_name=user.name,
        viewer_email=user.email,
        viewer_phone=user.phone,
        user_agent="Firefox Test Browser",
        **values,
    )


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture(autouse=True)
def fixed_report_clock(monkeypatch):
    monkeypatch.setattr("app.api.v1.admin_video_reports.report_now", lambda: NOW)


def _headers(client, email, device_id=None):
    role = "admin" if email == "reports-admin@example.test" else "student"
    identity = "1" if role == "admin" else "2"
    claims = {"role": role}
    if device_id:
        claims["device_id"] = device_id
    with client.application.app_context():
        token = create_access_token(identity=identity, additional_claims=claims)
    return {"Authorization": f"Bearer {token}"}


def test_reports_are_admin_only(client):
    assert client.get("/api/v1/admin/video-reports/summary").status_code == 401
    viewer = _headers(client, "viewer-one@example.test", "report-device")
    assert client.get("/api/v1/admin/video-reports/summary", headers=viewer).status_code == 403


def test_summary_marks_stale_sessions_and_calculates_filtered_metrics(client):
    response = client.get(
        "/api/v1/admin/video-reports/summary?category=large-animals",
        headers=_headers(client, "reports-admin@example.test"),
    )
    assert response.status_code == 200
    assert response.get_json() == {
        "attempts": 2,
        "successful": 2,
        "active": 1,
        "unique_viewers": 2,
        "watch_seconds": 90,
        "completion_rate": 50,
        "denied": 0,
        "failures": 0,
    }


@pytest.mark.parametrize(("query", "session_id"), [
    ("video=2", "33333333-3333-4333-8333-333333333333"),
    ("category=equine", "33333333-3333-4333-8333-333333333333"),
    ("course=1", "22222222-2222-4222-8222-222222222222"),
    ("access_type=general", "33333333-3333-4333-8333-333333333333"),
    ("viewer=viewer-one", "11111111-1111-4111-8111-111111111111"),
    ("status=provider_failed", "44444444-4444-4444-8444-444444444444"),
    ("device=browser-one", "11111111-1111-4111-8111-111111111111"),
    ("ip=203.0.113.20", "22222222-2222-4222-8222-222222222222"),
    ("date_from=2026-07-31&date_to=2026-07-31", "22222222-2222-4222-8222-222222222222"),
])
def test_session_list_supports_every_filter(client, query, session_id):
    response = client.get(
        f"/api/v1/admin/video-reports/sessions?{query}&per_page=1",
        headers=_headers(client, "reports-admin@example.test"),
    )
    assert response.status_code == 200
    body = response.get_json()
    assert body["sessions"][0]["session_id"] == session_id
    assert body["page"] == 1
    assert body["per_page"] == 1
    assert "events" not in body["sessions"][0]


def test_session_detail_returns_ordered_sanitized_timeline(client):
    response = client.get(
        "/api/v1/admin/video-reports/sessions/11111111-1111-4111-8111-111111111111",
        headers=_headers(client, "reports-admin@example.test"),
    )
    assert response.status_code == 200
    session = response.get_json()["session"]
    assert [event["type"] for event in session["events"]] == ["otp_issued", "play"]
    serialized = str(session).lower()
    assert "playbackinfo" not in serialized
    assert "vdocipher" not in serialized
    assert client.get(
        "/api/v1/admin/video-reports/sessions/00000000-0000-4000-8000-000000000000",
        headers=_headers(client, "reports-admin@example.test"),
    ).status_code == 404


def test_csv_uses_filter_parity_and_neutralizes_spreadsheet_formulas(client):
    response = client.get(
        "/api/v1/admin/video-reports/export.csv?viewer=viewer-one",
        headers=_headers(client, "reports-admin@example.test"),
    )
    assert response.status_code == 200
    assert response.mimetype == "text/csv"
    assert response.headers["X-Export-Limit"] == "10000"
    rows = list(csv.DictReader(io.StringIO(response.data.decode("utf-8-sig"))))
    assert len(rows) == 2
    assert {row["session_reference"] for row in rows} == {
        "11111111-1111-4111-8111-111111111111",
        "33333333-3333-4333-8333-333333333333",
    }
    assert all(row["viewer_name"] == "'=Viewer One" for row in rows)
    assert "otp" not in response.get_data(as_text=True).lower()


def test_csv_enforces_the_export_row_limit(client, monkeypatch):
    monkeypatch.setattr("app.api.v1.admin_video_reports.EXPORT_LIMIT", 1)
    response = client.get(
        "/api/v1/admin/video-reports/export.csv",
        headers=_headers(client, "reports-admin@example.test"),
    )
    rows = list(csv.DictReader(io.StringIO(response.data.decode("utf-8-sig"))))
    assert len(rows) == 1
    assert response.headers["X-Export-Limit"] == "1"


def test_invalid_query_values_are_rejected(client):
    headers = _headers(client, "reports-admin@example.test")
    assert client.get("/api/v1/admin/video-reports/sessions?date_from=not-a-date", headers=headers).status_code == 422
    assert client.get("/api/v1/admin/video-reports/sessions?status=unknown", headers=headers).status_code == 422
    assert client.get("/api/v1/admin/video-reports/sessions?per_page=500", headers=headers).status_code == 422
