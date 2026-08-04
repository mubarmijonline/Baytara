"""Public standalone-video catalog and free playback coverage."""

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Lesson, User, UserDevice, VideoEntitlement, VideoPlaybackSession
from app.security import hash_password


@pytest.fixture
def public_video_app(tmp_path, monkeypatch):
    config = type("PublicVideoConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'public-videos.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)

    captured = {}

    class FakeProvider:
        def issue_otp(self, video_id, annotate=None, ttl=300):
            captured["video_id"] = video_id
            captured["annotate"] = annotate
            return {
                "otp": f"otp-{video_id}",
                "playbackInfo": "public-playback-info",
            }

    import app.api.v1.video as video_api
    monkeypatch.setattr(video_api, "provider", FakeProvider())

    with app.app_context():
        db.create_all()
        student = User(
            name="Student", email="public-video-student@example.test",
            phone="+201000000002", password_hash=hash_password("secret12"), role="student",
        )
        large = Category(
            name="الحيوانات الكبيرة - الأبقار والأغنام",
            name_en="Large animals - Cattle & Sheep",
            slug="large-animals",
        )
        equine = Category(name="الخيول", name_en="Equine", slug="equine")
        db.session.add_all([student, large, equine])
        db.session.flush()
        rows = [
            Lesson(
                title="مقدمة", title_en="Introduction", description="وصف المقدمة",
                category_id=large.id, access_type="free", status="published",
                poster="https://cdn.example.test/introduction.jpg",
                vdocipher_video_id="public-introduction",
            ),
            Lesson(
                title="خاص بالأطباء", category_id=equine.id, access_type="vet_free",
                status="published", vdocipher_video_id="vet-only-video",
            ),
            Lesson(
                title="مسودة", category_id=large.id, access_type="free", status="draft",
                vdocipher_video_id="draft-video",
            ),
            Lesson(
                title="مدفوع", category_id=large.id, access_type="general", status="published",
                price=100, vdocipher_video_id="paid-video",
            ),
        ]
        db.session.add_all(rows)
        db.session.commit()
        ids = {row.title_en or row.title: row.id for row in rows}
        app.config["PLAYBACK_CAPTURED"] = captured
        yield app, ids
        db.session.remove()
        db.drop_all()


def test_anonymous_video_catalog_is_published_category_aware_and_localized(public_video_app):
    app, _ = public_video_app
    response = app.test_client().get(
        "/api/v1/videos?category=large-animals&access_type=free&lang=en",
    )

    assert response.status_code == 200
    body = response.get_json()
    assert body["total"] == 1
    assert body["videos"] == [{
        **body["videos"][0],
        "title": "Introduction",
        "description": "وصف المقدمة",
        "poster": "https://cdn.example.test/introduction.jpg",
        "access_type": "free",
        "status": "published",
        "category": {
            "id": body["videos"][0]["category"]["id"],
            "name": "Large animals - Cattle & Sheep",
            "name_en": "Large animals - Cattle & Sheep",
            "slug": "large-animals",
        },
    }]
    assert "vdocipher_video_id" not in body["videos"][0]


def test_anonymous_video_detail_hides_restricted_and_draft_rows(public_video_app):
    app, ids = public_video_app
    client = app.test_client()

    visible = client.get(f"/api/v1/videos/{ids['Introduction']}?lang=en")
    assert visible.status_code == 200
    assert visible.get_json()["video"]["title"] == "Introduction"
    assert visible.get_json()["video"]["can_play"] is False
    assert visible.get_json()["video"]["requires_auth"] is True
    paid = client.get(f"/api/v1/videos/{ids['مدفوع']}")
    assert paid.status_code == 200
    assert paid.get_json()["video"]["can_play"] is False
    assert client.get(f"/api/v1/videos/{ids['خاص بالأطباء']}").status_code == 404
    assert client.get(f"/api/v1/videos/{ids['مسودة']}").status_code == 404


def test_anonymous_free_playback_is_denied_and_audited(public_video_app):
    app, ids = public_video_app
    client = app.test_client()

    response = client.post(
        "/api/v1/video/playback", json={"lesson_id": ids["Introduction"]},
    )
    assert response.status_code == 401
    assert response.get_json() == {"error": "authentication_required"}
    with app.app_context():
        session = VideoPlaybackSession.query.one()
        assert session.video_id == ids["Introduction"]
        assert session.status == "denied"
        assert session.reason == "authentication_required"
        assert session.user_id is None
        assert session.events[0].event_type == "denied"


def _viewer_headers(client, device_id="public-browser-1"):
    login = client.post("/api/v1/auth/login", json={
        "email": "public-video-student@example.test", "password": "secret12", "device_id": device_id,
    })
    assert login.status_code == 200
    return {
        "Authorization": f"Bearer {login.get_json()['access_token']}",
        "X-Baytara-Device-ID": device_id,
        "X-Real-IP": "203.0.113.9",
    }


def test_signed_in_free_playback_uses_identity_device_watermark_and_session(public_video_app):
    app, ids = public_video_app
    client = app.test_client()
    response = client.post(
        "/api/v1/video/playback", headers=_viewer_headers(client),
        json={"lesson_id": ids["Introduction"]},
    )
    assert response.status_code == 200
    assert response.get_json()["otp"] == "otp-public-introduction"
    assert response.get_json()["playbackInfo"] == "public-playback-info"
    assert response.get_json()["session_id"]

    with app.app_context():
        session = VideoPlaybackSession.query.filter_by(public_id=response.get_json()["session_id"]).one()
        assert session.status == "issued"
        assert session.device_id == "public-browser-1"
        assert session.ip_address == "203.0.113.9"
        assert session.events[0].event_type == "otp_issued"
        watermark_text = " ".join(row["text"] for row in app.config["PLAYBACK_CAPTURED"]["annotate"])
        assert "public-video-student@example.test" in watermark_text
        assert "+201000000002" in watermark_text
        assert "203.0.113.9" in watermark_text
        assert session.public_id[:8] in watermark_text


def test_paid_video_playback_uses_same_identity_device_watermark_and_session(public_video_app):
    app, ids = public_video_app
    client = app.test_client()
    with app.app_context():
        student = User.query.filter_by(email="public-video-student@example.test").one()
        db.session.add(VideoEntitlement(user_id=student.id, video_id=ids["مدفوع"], source="purchase"))
        db.session.commit()

    response = client.post(
        "/api/v1/video/playback", headers=_viewer_headers(client, "paid-browser"),
        json={"lesson_id": ids["مدفوع"]},
    )
    assert response.status_code == 200
    assert response.get_json()["otp"] == "otp-paid-video"
    assert response.get_json()["session_id"]

    with app.app_context():
        session = VideoPlaybackSession.query.filter_by(public_id=response.get_json()["session_id"]).one()
        assert session.status == "issued"
        assert session.device_id == "paid-browser"
        assert session.video_id == ids["مدفوع"]
        watermark_text = " ".join(row["text"] for row in app.config["PLAYBACK_CAPTURED"]["annotate"])
        assert "public-video-student@example.test" in watermark_text
        assert "+201000000002" in watermark_text
        assert "203.0.113.9" in watermark_text
        assert session.public_id[:8] in watermark_text


def test_playback_rejects_missing_phone_and_mismatched_or_removed_device(public_video_app):
    app, ids = public_video_app
    client = app.test_client()
    headers = _viewer_headers(client, "security-browser")

    mismatched = client.post(
        "/api/v1/video/playback", headers={**headers, "X-Baytara-Device-ID": "different-browser"},
        json={"lesson_id": ids["Introduction"]},
    )
    assert mismatched.status_code == 403
    assert mismatched.get_json() == {"error": "device_mismatch"}

    with app.app_context():
        UserDevice.query.filter_by(device_id="security-browser").delete()
        db.session.commit()
    removed = client.post(
        "/api/v1/video/playback", headers=headers, json={"lesson_id": ids["Introduction"]},
    )
    assert removed.status_code == 403
    assert removed.get_json() == {"error": "device_not_registered"}

    with app.app_context():
        student = User.query.filter_by(email="public-video-student@example.test").one()
        student.phone = None
        db.session.add(UserDevice(user_id=student.id, device_id="security-browser"))
        db.session.commit()
    no_phone = client.post(
        "/api/v1/video/playback", headers=headers, json={"lesson_id": ids["Introduction"]},
    )
    assert no_phone.status_code == 403
    assert no_phone.get_json() == {"error": "phone_required"}


def test_signed_in_student_cannot_play_an_unpublished_free_video(public_video_app):
    app, ids = public_video_app
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "public-video-student@example.test", "password": "secret12", "device_id": "draft-browser",
    })
    response = client.post(
        "/api/v1/video/playback",
        headers={
            "Authorization": f"Bearer {login.get_json()['access_token']}",
            "X-Baytara-Device-ID": "draft-browser",
        },
        json={"lesson_id": ids["مسودة"]},
    )
    assert response.status_code == 403
    assert response.get_json() == {"error": "not_entitled"}
