"""Composite Admin video-library coverage using fake VdoCipher pages and SQLite."""
from pathlib import Path

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, CourseVideo, Lesson, User
from app.security import hash_password
from app.services import vdocipher_admin as va


@pytest.fixture
def app(tmp_path):
    config = type("VideoLibraryConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'video-library.sqlite'}",
        "TESTING": True,
    })
    application = create_app(config)
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture
def admin_client(app):
    with app.app_context():
        admin = User(name="Admin", email="video-library@example.test", password_hash=hash_password("secret12"), role="admin")
        instructor = User(name="Instructor", email="video-library-instructor@example.test", password_hash="hash", role="instructor")
        category = Category(name="Equine", name_en="Equine", slug="equine-video-library")
        db.session.add_all([admin, instructor, category])
        db.session.flush()
        course = Course(title="Dawara", slug="dawara-video-library", instructor_id=instructor.id)
        db.session.add(course)
        db.session.commit()
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={"email": "video-library@example.test", "password": "secret12"})
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    return client


def provider_video(video_id, title, status="ready"):
    return {"id": video_id, "title": title, "description": "", "poster": "", "duration_seconds": 90, "status": status, "uploaded_at": "2026-08-01"}


def test_all_folder_videos_reads_provider_pages_sequentially_and_caches(monkeypatch):
    calls = []

    class FakeProvider:
        def list_videos(self, **params):
            calls.append(params)
            page = params["page"]
            return {"count": 81, "rows": [provider_video(f"v{page}", f"Page {page}")]}

    monkeypatch.setattr(va, "client", FakeProvider())
    va.clear_cache()
    assert [video["id"] for video in va.list_all_folder_videos("root")["videos"]] == ["v1", "v2", "v3"]
    assert [call["page"] for call in calls] == [1, 2, 3]
    assert va.list_all_folder_videos("root")["count"] == 81
    assert [call["page"] for call in calls] == [1, 2, 3]


def test_video_library_uses_exact_folder_membership_and_root_local_only(admin_client, app, monkeypatch):
    from app.api.v1 import admin as admin_api

    with app.app_context():
        category = Category.query.filter_by(slug="equine-video-library").one()
        root = Lesson(title="Root", vdocipher_video_id="root-video", category_id=category.id)
        nested = Lesson(title="Nested", vdocipher_video_id="nested-video", category_id=category.id)
        local = Lesson(title="Local only", category_id=category.id)
        db.session.add_all([root, nested, local])
        db.session.commit()

    rows = {
        "root": {"count": 1, "videos": [provider_video("root-video", "Root")]},
        "child": {"count": 1, "videos": [provider_video("nested-video", "Nested")]},
    }
    monkeypatch.setattr(admin_api.vdocipher_admin, "list_all_folder_videos", lambda folder_id, **_: rows[folder_id])

    root = admin_client.get("/api/v1/admin/video-library?folder_id=root&per_page=40").get_json()
    assert [item["id"] for item in root["items"]] == ["root-video", "catalog-3"]
    assert root["items"][0]["catalog"]["title"] == "Root"
    child = admin_client.get("/api/v1/admin/video-library?folder_id=child").get_json()
    assert [item["id"] for item in child["items"]] == ["nested-video"]


def test_video_library_filters_search_assignment_course_and_paginates_full_catalog(admin_client, app, monkeypatch):
    from app.api.v1 import admin as admin_api

    with app.app_context():
        category = Category.query.filter_by(slug="equine-video-library").one()
        course = Course.query.filter_by(slug="dawara-video-library").one()
        videos = []
        for index in range(101):
            videos.append(Lesson(
                title=f"Arabic {index}", title_en=f"English {index}", description_en=f"Searchable {index}",
                vdocipher_video_id=f"provider-{index}", category_id=category.id,
                access_type="general", status="published",
            ))
        db.session.add_all(videos)
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=videos[100].id))
        db.session.commit()
        course_id = course.id

    provider_rows = [provider_video(f"provider-{index}", f"Provider {index}", "ready" if index % 2 == 0 else "preparing") for index in range(101)]
    monkeypatch.setattr(admin_api.vdocipher_admin, "list_all_folder_videos", lambda **_: {"count": 101, "videos": provider_rows})

    searched = admin_client.get("/api/v1/admin/video-library?q=Searchable+100&per_page=40").get_json()
    assert searched["total"] == 1
    assert searched["items"][0]["id"] == "provider-100"
    assigned = admin_client.get(f"/api/v1/admin/video-library?course_id={course_id}&assignment=assigned&status=ready").get_json()
    assert [item["id"] for item in assigned["items"]] == ["provider-100"]
    page_three = admin_client.get("/api/v1/admin/video-library?page=3&per_page=40").get_json()
    assert page_three["total"] == 101
    assert page_three["pages"] == 3
    assert len(page_three["items"]) == 21


def test_video_library_requires_admin_and_maps_provider_errors(admin_client, app, monkeypatch):
    from app.api.v1 import admin as admin_api

    assert app.test_client().get("/api/v1/admin/video-library").status_code == 401
    monkeypatch.setattr(admin_api.vdocipher_admin, "list_all_folder_videos", lambda **_: (_ for _ in ()).throw(va.VdoCipherAdminError("vdocipher_rate_limited")))
    response = admin_client.get("/api/v1/admin/video-library")
    assert response.status_code == 429
    assert response.get_json() == {"error": "vdocipher_rate_limited"}


if __name__ == "__main__":
    raise SystemExit(pytest.main([str(Path(__file__).resolve()), "-q"]))
