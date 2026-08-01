"""Public standalone-video catalog and free playback coverage."""

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Lesson, User
from app.security import hash_password


@pytest.fixture
def public_video_app(tmp_path, monkeypatch):
    config = type("PublicVideoConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'public-videos.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)

    class FakeProvider:
        def issue_otp(self, video_id, annotate=None, ttl=300):
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
            password_hash=hash_password("secret12"), role="student",
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
    assert visible.get_json()["video"]["can_play"] is True
    paid = client.get(f"/api/v1/videos/{ids['مدفوع']}")
    assert paid.status_code == 200
    assert paid.get_json()["video"]["can_play"] is False
    assert client.get(f"/api/v1/videos/{ids['خاص بالأطباء']}").status_code == 404
    assert client.get(f"/api/v1/videos/{ids['مسودة']}").status_code == 404


def test_anonymous_playback_allows_only_published_free_video(public_video_app):
    app, ids = public_video_app
    client = app.test_client()

    response = client.post(
        "/api/v1/video/playback", json={"lesson_id": ids["Introduction"]},
    )
    assert response.status_code == 200
    assert response.get_json() == {
        "otp": "otp-public-introduction",
        "playbackInfo": "public-playback-info",
    }

    assert client.post(
        "/api/v1/video/playback", json={"lesson_id": ids["خاص بالأطباء"]},
    ).status_code == 403
    assert client.post(
        "/api/v1/video/playback", json={"lesson_id": ids["مسودة"]},
    ).status_code == 403


def test_signed_in_student_cannot_play_an_unpublished_free_video(public_video_app):
    app, ids = public_video_app
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "public-video-student@example.test", "password": "secret12",
    })
    response = client.post(
        "/api/v1/video/playback",
        headers={"Authorization": f"Bearer {login.get_json()['access_token']}"},
        json={"lesson_id": ids["مسودة"]},
    )
    assert response.status_code == 403
    assert response.get_json() == {"error": "not_entitled"}
