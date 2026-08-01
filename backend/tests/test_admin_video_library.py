"""Composite Admin video-library coverage using fake VdoCipher pages and SQLite."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import threading

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
        instructor = User(name="Instructor", email="video-library-instructor@example.test", password_hash=hash_password("secret12"), role="instructor")
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
            start = (page - 1) * 40
            stop = min(start + 40, 81)
            return {
                "count": 81,
                "rows": [provider_video(f"v{index}", f"Video {index}") for index in range(start, stop)],
            }

    monkeypatch.setattr(va, "client", FakeProvider())
    va.clear_cache()
    assert [video["id"] for video in va.list_all_folder_videos("root")["videos"]] == [f"v{index}" for index in range(81)]
    assert [call["page"] for call in calls] == [1, 2, 3]
    assert va.list_all_folder_videos("root")["count"] == 81
    assert [call["page"] for call in calls] == [1, 2, 3]


def test_all_folder_videos_deduplicates_in_stable_order_and_stops_on_short_page(monkeypatch):
    calls = []

    class FakeProvider:
        def list_videos(self, **params):
            calls.append(params["page"])
            if params["page"] == 1:
                return {
                    "count": 200,
                    "rows": [provider_video(f"v{index}", f"Video {index}") for index in range(40)],
                }
            return {
                "count": 200,
                "rows": [provider_video("v39", "Duplicate"), provider_video("v40", "Video 40")],
            }

    monkeypatch.setattr(va, "client", FakeProvider())
    va.clear_cache()
    result = va.list_all_folder_videos("root")
    assert [video["id"] for video in result["videos"]] == [f"v{index}" for index in range(41)]
    assert result["count"] == 41
    assert calls == [1, 2]


def test_all_folder_videos_stops_when_a_full_page_has_no_new_ids(monkeypatch):
    calls = []
    first_page = [provider_video(f"v{index}", f"Video {index}") for index in range(40)]

    class FakeProvider:
        def list_videos(self, **params):
            calls.append(params["page"])
            return {"count": 120, "rows": first_page}

    monkeypatch.setattr(va, "client", FakeProvider())
    va.clear_cache()
    result = va.list_all_folder_videos("root")
    assert [video["id"] for video in result["videos"]] == [f"v{index}" for index in range(40)]
    assert result["count"] == 40
    assert calls == [1, 2]


@pytest.mark.parametrize("count", [None, "many", -1, 100_001])
def test_all_folder_videos_rejects_malformed_or_implausible_counts(monkeypatch, count):
    calls = []

    class FakeProvider:
        def list_videos(self, **params):
            calls.append(params["page"])
            response = {"rows": [provider_video("v1", "Video 1")]}
            if count is not None:
                response["count"] = count
            return response

    monkeypatch.setattr(va, "client", FakeProvider())
    va.clear_cache()
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        va.list_all_folder_videos("root")
    assert calls == [1]


def test_all_folder_videos_validates_every_page_response(monkeypatch):
    class FakeProvider:
        def list_videos(self, **params):
            if params["page"] == 1:
                return {
                    "count": 80,
                    "rows": [provider_video(f"v{index}", f"Video {index}") for index in range(40)],
                }
            return {"count": None, "rows": [provider_video("v40", "Video 40")]}

    monkeypatch.setattr(va, "client", FakeProvider())
    va.clear_cache()
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        va.list_all_folder_videos("root")


def test_all_folder_videos_coalesces_concurrent_cache_fills(monkeypatch):
    calls = []
    entered = threading.Event()
    release = threading.Event()

    class FakeProvider:
        def list_videos(self, **params):
            calls.append(params["page"])
            entered.set()
            assert release.wait(timeout=2)
            return {"count": 1, "rows": [provider_video("v1", "Video 1")]}

    monkeypatch.setattr(va, "client", FakeProvider())
    va.clear_cache()
    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(va.list_all_folder_videos, "root", True)
        assert entered.wait(timeout=2)
        second = pool.submit(va.list_all_folder_videos, "root", True)
        release.set()
        assert first.result(timeout=2) == second.result(timeout=2)
    assert calls == [1]


def test_clear_cache_during_flight_discards_stale_result_and_retries(monkeypatch):
    calls = []
    entered = threading.Event()
    release = threading.Event()

    class MutatingProvider:
        def list_videos(self, **params):
            calls.append(params["page"])
            if len(calls) == 1:
                entered.set()
                assert release.wait(timeout=2)
                return {"count": 1, "rows": [provider_video("stale", "Stale video")]}
            return {"count": 1, "rows": [provider_video("fresh", "Fresh video")]}

    monkeypatch.setattr(va, "client", MutatingProvider())
    va.clear_cache()
    with ThreadPoolExecutor(max_workers=1) as pool:
        result = pool.submit(va.list_all_folder_videos, "root")
        assert entered.wait(timeout=2)
        va.clear_cache()
        release.set()
        assert [video["id"] for video in result.result(timeout=2)["videos"]] == ["fresh"]
    assert calls == [1, 1]
    assert [video["id"] for video in va.list_all_folder_videos("root")["videos"]] == ["fresh"]
    assert calls == [1, 1]


def test_refresh_does_not_join_an_older_non_refresh_flight(monkeypatch):
    calls = []
    ordinary_entered = threading.Event()
    refresh_entered = threading.Event()
    release_ordinary = threading.Event()
    release_refresh = threading.Event()

    class RefreshProvider:
        def list_videos(self, **params):
            calls.append(params["page"])
            if len(calls) == 1:
                ordinary_entered.set()
                assert release_ordinary.wait(timeout=2)
                return {"count": 1, "rows": [provider_video("stale", "Stale video")]}
            refresh_entered.set()
            assert release_refresh.wait(timeout=2)
            return {"count": 1, "rows": [provider_video("fresh", "Fresh video")]}

    monkeypatch.setattr(va, "client", RefreshProvider())
    va.clear_cache()
    with ThreadPoolExecutor(max_workers=2) as pool:
        ordinary = pool.submit(va.list_all_folder_videos, "root")
        assert ordinary_entered.wait(timeout=2)
        refreshed = pool.submit(va.list_all_folder_videos, "root", True)
        assert refresh_entered.wait(timeout=2)
        release_ordinary.set()
        release_refresh.set()
        assert [video["id"] for video in refreshed.result(timeout=2)["videos"]] == ["fresh"]
        assert [video["id"] for video in ordinary.result(timeout=2)["videos"]] == ["fresh"]
    assert calls == [1, 1]


def test_malformed_flight_fails_all_waiters_and_allows_retry(monkeypatch):
    calls = []
    entered = threading.Event()
    release = threading.Event()

    class RecoveringProvider:
        def list_videos(self, **params):
            calls.append(params["page"])
            if len(calls) == 1:
                entered.set()
                assert release.wait(timeout=2)
                return {"count": 1, "rows": [{"id": "bad", "posters": 7}]}
            return {"count": 1, "rows": [provider_video("fresh", "Fresh video")]}

    def read_library():
        try:
            va.list_all_folder_videos("root")
        except Exception as exc:  # noqa: BLE001 - assert the public failure contract
            return type(exc), str(exc)
        return None

    monkeypatch.setattr(va, "client", RecoveringProvider())
    va.clear_cache()
    with ThreadPoolExecutor(max_workers=2) as pool:
        leader = pool.submit(read_library)
        assert entered.wait(timeout=2)
        follower = pool.submit(read_library)
        release.set()
        assert leader.result(timeout=2) == (va.VdoCipherAdminError, "vdocipher_bad_response")
        assert follower.result(timeout=2) == (va.VdoCipherAdminError, "vdocipher_bad_response")

    assert [video["id"] for video in va.list_all_folder_videos("root")["videos"]] == ["fresh"]
    assert calls == [1, 1]


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


def test_video_library_includes_bilingual_catalog_metadata(admin_client, app, monkeypatch):
    from app.api.v1 import admin as admin_api

    with app.app_context():
        category = Category.query.filter_by(slug="equine-video-library").one()
        category.name = "الخيول"
        category.name_en = "Equine"
        course = Course.query.filter_by(slug="dawara-video-library").one()
        course.title = "دورة الخيول"
        course.title_en = "Equine course"
        video = Lesson(
            title="فحص الخيول", title_en="Equine exam", vdocipher_video_id="bilingual-video",
            category_id=category.id,
        )
        db.session.add(video)
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=video.id))
        db.session.commit()

    monkeypatch.setattr(
        admin_api.vdocipher_admin,
        "list_all_folder_videos",
        lambda **_: {"count": 1, "videos": [provider_video("bilingual-video", "Provider title")]},
    )
    catalog = admin_client.get("/api/v1/admin/video-library").get_json()["items"][0]["catalog"]
    assert catalog["title"] == "فحص الخيول"
    assert catalog["title_en"] == "Equine exam"
    assert catalog["category"] == {
        "id": catalog["category"]["id"], "name": "الخيول", "name_en": "Equine",
        "slug": "equine-video-library",
    }
    assert catalog["courses"] == [{
        "id": catalog["courses"][0]["id"], "title": "دورة الخيول", "title_en": "Equine course",
        "position": 0,
    }]


def test_video_library_requires_admin_and_maps_provider_errors(admin_client, app, monkeypatch):
    from app.api.v1 import admin as admin_api

    assert app.test_client().get("/api/v1/admin/video-library").status_code == 401
    monkeypatch.setattr(admin_api.vdocipher_admin, "list_all_folder_videos", lambda **_: (_ for _ in ()).throw(va.VdoCipherAdminError("vdocipher_rate_limited")))
    response = admin_client.get("/api/v1/admin/video-library")
    assert response.status_code == 429
    assert response.get_json() == {"error": "vdocipher_rate_limited"}


@pytest.mark.parametrize("query", [
    "category_id=bad", "category_id=0", "category_id=-1",
    "course_id=bad", "course_id=0", "course_id=-1",
    "status=unknown", "publication=unknown", "access_type=unknown", "assignment=unknown",
    "folder_id=../root", "page=bad", "page=0", "page=-1",
    "per_page=bad", "per_page=0", "per_page=-1", "per_page=41",
    "refresh=0", "refresh=true", "refresh=2",
])
def test_video_library_rejects_invalid_query_values_with_stable_error(admin_client, monkeypatch, query):
    from app.api.v1 import admin as admin_api

    provider_called = False

    def provider(**_):
        nonlocal provider_called
        provider_called = True
        return {"count": 0, "videos": []}

    monkeypatch.setattr(admin_api.vdocipher_admin, "list_all_folder_videos", provider)
    response = admin_client.get(f"/api/v1/admin/video-library?{query}")
    assert response.status_code == 422
    assert response.get_json() == {"error": "invalid_video_library_query"}
    assert provider_called is False


def test_video_library_denies_an_authenticated_non_admin(app, monkeypatch):
    from app.api.v1 import admin as admin_api

    with app.app_context():
        db.session.add(User(
            name="Denied Instructor", email="denied-video-library@example.test",
            password_hash=hash_password("secret12"), role="instructor",
        ))
        db.session.commit()
    provider_called = False

    def provider(**_):
        nonlocal provider_called
        provider_called = True
        return {"count": 0, "videos": []}

    monkeypatch.setattr(admin_api.vdocipher_admin, "list_all_folder_videos", provider)
    client = app.test_client()
    login = client.post(
        "/api/v1/auth/login",
        json={"email": "denied-video-library@example.test", "password": "secret12"},
    )
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    response = client.get("/api/v1/admin/video-library")
    assert response.status_code == 403
    assert response.get_json() == {"error": "forbidden"}
    assert provider_called is False


if __name__ == "__main__":
    raise SystemExit(pytest.main([str(Path(__file__).resolve()), "-q"]))
