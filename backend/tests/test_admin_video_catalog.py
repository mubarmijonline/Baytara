"""Admin video catalog API coverage using an isolated temporary SQLite database.

Run directly with ``python -m tests.test_admin_video_catalog`` or collect with
``pytest tests/test_admin_video_catalog.py``.
"""
from pathlib import Path

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, CourseModule, CourseVideo, Lesson, User
from app.security import hash_password


@pytest.fixture
def app(tmp_path):
    config = type("AdminVideoCatalogConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'admin-video-catalog.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def admin_client(app):
    with app.app_context():
        admin = User(name="Admin", email="admin-video-catalog@example.test",
                     password_hash=hash_password("secret12"), role="admin")
        db.session.add(admin)
        db.session.commit()
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "admin-video-catalog@example.test", "password": "secret12",
    })
    assert login.status_code == 200
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    return client


@pytest.fixture
def catalog_data(app):
    with app.app_context():
        instructor = User(name="Instructor", email="video-instructor@example.test",
                          password_hash="hash", role="instructor")
        category = Category(name="Equine", slug="equine-video-catalog")
        db.session.add_all([instructor, category])
        db.session.flush()
        courses = [
            Course(title="Course one", slug="course-one-video-catalog", instructor_id=instructor.id),
            Course(title="Course two", slug="course-two-video-catalog", instructor_id=instructor.id),
        ]
        db.session.add_all(courses)
        db.session.commit()
        return {"category_id": category.id, "courses": [course.id for course in courses]}


def create_video(client, **overrides):
    body = {"title": "Equine examination", "access_type": "free", **overrides}
    response = client.post("/api/v1/admin/videos", json=body)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["video"]


def test_assign_same_video_to_two_courses_and_reorder(admin_client, catalog_data):
    video = create_video(admin_client)
    first, second = catalog_data["courses"]

    assert admin_client.post(f"/api/v1/admin/videos/{video['id']}/courses",
                             json={"course_ids": [first, second]}).status_code == 200
    assert admin_client.put(f"/api/v1/admin/courses/{first}/videos/order",
                            json={"video_ids": [video['id']]}).status_code == 200

    payload = admin_client.get(f"/api/v1/admin/videos/{video['id']}").get_json()["video"]
    assert {course["id"] for course in payload["courses"]} == {first, second}


def test_video_catalog_validates_canonical_fields_and_provider_id(admin_client, catalog_data):
    category_id = catalog_data["category_id"]
    create_video(admin_client, vdocipher_video_id="provider-duplicate")

    duplicate = admin_client.post("/api/v1/admin/videos", json={
        "title": "Duplicate", "access_type": "free", "vdocipher_video_id": "provider-duplicate",
    })
    assert duplicate.status_code == 409
    assert duplicate.get_json()["error"] == "duplicate_video"

    invalid_category = admin_client.post("/api/v1/admin/videos", json={
        "title": "Invalid category", "access_type": "free", "category_id": 999999,
    })
    assert invalid_category.status_code == 422
    assert invalid_category.get_json()["errors"] == ["invalid_category"]

    unpublished = create_video(admin_client, title="Publish me")
    publish = admin_client.patch(f"/api/v1/admin/videos/{unpublished['id']}", json={"status": "published"})
    assert publish.status_code == 422
    assert publish.get_json()["errors"] == ["category_required"]

    published = admin_client.patch(f"/api/v1/admin/videos/{unpublished['id']}", json={
        "status": "published", "category_id": category_id,
    })
    assert published.status_code == 200

    invalid_status = admin_client.post("/api/v1/admin/videos", json={
        "title": "Invalid status", "access_type": "free", "status": "encoding",
    })
    assert invalid_status.status_code == 422
    assert invalid_status.get_json()["errors"] == ["invalid_status"]

    untyped_criteria = admin_client.post("/api/v1/admin/videos", json={
        "title": "Untyped criteria", "access_type": "free", "criteria": {"level": "advanced"},
    })
    assert untyped_criteria.status_code == 422
    assert untyped_criteria.get_json()["errors"] == ["unsupported_criteria"]


def test_remove_assignment_and_reject_order_membership_mismatch(admin_client, catalog_data):
    first, second = catalog_data["courses"]
    video = create_video(admin_client)
    assert admin_client.post(f"/api/v1/admin/videos/{video['id']}/courses",
                             json={"course_ids": [first, second]}).status_code == 200

    removed = admin_client.delete(f"/api/v1/admin/videos/{video['id']}/courses/{second}")
    assert removed.status_code == 200
    assert {course["id"] for course in removed.get_json()["video"]["courses"]} == {first}

    mismatch = admin_client.put(f"/api/v1/admin/courses/{first}/videos/order", json={"video_ids": []})
    assert mismatch.status_code == 422
    assert mismatch.get_json()["errors"] == ["video_order_membership_mismatch"]

    malformed = admin_client.post(f"/api/v1/admin/videos/{video['id']}/courses", json={"course_ids": first})
    assert malformed.status_code == 422
    assert malformed.get_json()["errors"] == ["invalid_course_ids"]

    malformed_create = admin_client.post("/api/v1/admin/videos", json={
        "title": "Malformed course list", "access_type": "free", "course_ids": first,
    })
    assert malformed_create.status_code == 422
    assert malformed_create.get_json()["errors"] == ["invalid_course_ids"]


def test_catalog_lists_paginated_filtered_videos_and_protects_dependencies(admin_client, catalog_data):
    category_id = catalog_data["category_id"]
    first, _ = catalog_data["courses"]
    matching = create_video(admin_client, title="Equine anatomy", category_id=category_id,
                            vdocipher_video_id="provider-filter")
    create_video(admin_client, title="Poultry anatomy")

    filtered = admin_client.get(
        f"/api/v1/admin/videos?q=equine&category_id={category_id}&page=1&per_page=1"
    )
    assert filtered.status_code == 200
    body = filtered.get_json()
    assert set(body) >= {"items", "total", "page"}
    assert body["total"] == 1
    assert body["items"][0]["id"] == matching["id"]

    assert admin_client.post(f"/api/v1/admin/videos/{matching['id']}/courses",
                             json={"course_ids": [first]}).status_code == 200
    blocked = admin_client.delete(f"/api/v1/admin/videos/{matching['id']}")
    assert blocked.status_code == 409
    assert blocked.get_json()["error"] == "video_in_use"
    legacy_blocked = admin_client.delete(f"/api/v1/admin/lessons/{matching['id']}")
    assert legacy_blocked.status_code == 409
    assert legacy_blocked.get_json()["error"] == "video_in_use"


def test_vdocipher_import_creates_and_reuses_canonical_course_assignments(
        admin_client, catalog_data, monkeypatch):
    from app.api.v1 import admin as admin_api

    first, second = catalog_data["courses"]
    monkeypatch.setattr(admin_api.vdocipher_admin, "ensure_course_folder", lambda course: f"course-{course.id}")

    created = admin_client.post("/api/v1/admin/vdocipher/import", json={
        "video_id": "provider-canonical", "title": "Canonical import", "course_id": first,
    })
    assert created.status_code == 201, created.get_json()
    created_video = created.get_json()["video"]
    assert created_video["course_id"] is None
    assert {course["id"] for course in created_video["courses"]} == {first}

    removed_criteria = admin_client.post("/api/v1/admin/vdocipher/import", json={
        "video_id": "provider-canonical", "course_ids": [second], "criteria": {"level": "advanced"},
    })
    assert removed_criteria.status_code == 422
    assert removed_criteria.get_json()["errors"] == ["unsupported_criteria"]

    invalid_status = admin_client.post("/api/v1/admin/vdocipher/import", json={
        "video_id": "provider-canonical", "course_ids": [second], "status": "encoding",
    })
    assert invalid_status.status_code == 422
    assert invalid_status.get_json()["errors"] == ["invalid_status"]

    invalid_typed = admin_client.post("/api/v1/admin/vdocipher/import", json={
        "video_id": "provider-canonical", "course_ids": [second], "access_days": 0,
    })
    assert invalid_typed.status_code == 422
    assert invalid_typed.get_json()["errors"] == ["positive_access_days_required"]

    reused = admin_client.post("/api/v1/admin/vdocipher/import", json={
        "video_id": "provider-canonical", "course_ids": [second],
        "status": "published", "category_id": catalog_data["category_id"],
        "price": 100, "access_days": 30,
    })
    assert reused.status_code == 200, reused.get_json()
    reused_video = reused.get_json()["video"]
    assert reused_video["id"] == created_video["id"]
    assert reused_video["title"] == "Canonical import"
    assert reused_video["status"] == "published"
    assert reused_video["access_days"] == 30
    assert reused_video["price"] == 0
    assert {course["id"] for course in reused_video["courses"]} == {first, second}

    malformed = admin_client.post("/api/v1/admin/vdocipher/import", json={
        "video_id": "provider-malformed", "course_ids": first,
    })
    assert malformed.status_code == 422
    assert malformed.get_json()["errors"] == ["invalid_course_ids"]


def test_course_content_and_filters_union_canonical_direct_and_module_rows(admin_client, app, catalog_data):
    first, _ = catalog_data["courses"]
    with app.app_context():
        direct = Lesson(title="Legacy direct", course_id=first, position=2)
        module = CourseModule(course_id=first, title="Legacy module", position=1)
        canonical = Lesson(title="Canonical", position=9)
        standalone = Lesson(title="Standalone")
        db.session.add_all([direct, module, canonical, standalone])
        db.session.flush()
        module_video = Lesson(title="Legacy module video", module_id=module.id, position=3)
        db.session.add_all([module_video, CourseVideo(course_id=first, video_id=canonical.id, position=0)])
        db.session.commit()
        expected_ids = {canonical.id, direct.id, module_video.id}
        canonical_id = canonical.id
        direct_id = direct.id
        module_video_id = module_video.id
        standalone_id = standalone.id

    content = admin_client.get(f"/api/v1/admin/courses/{first}").get_json()["course"]["videos"]
    assert [video["id"] for video in content] == [canonical_id, direct_id, module_video_id]

    assigned = admin_client.get(f"/api/v1/admin/videos?course_id={first}").get_json()["items"]
    assert {video["id"] for video in assigned} == expected_ids

    standalone = admin_client.get("/api/v1/admin/videos?standalone=1").get_json()["items"]
    standalone_ids = {video["id"] for video in standalone}
    assert standalone_id in standalone_ids
    assert not expected_ids & standalone_ids


def test_category_delete_protects_fixed_and_video_references(admin_client, app, catalog_data):
    with app.app_context():
        fixed = Category(name="Fixed", slug="fixed-video-catalog", is_fixed=True)
        db.session.add(fixed)
        db.session.commit()
        fixed_id = fixed.id

    assert admin_client.delete(f"/api/v1/admin/categories/{fixed_id}").get_json()["error"] == "fixed_category"
    create_video(admin_client, category_id=catalog_data["category_id"])
    response = admin_client.delete(f"/api/v1/admin/categories/{catalog_data['category_id']}")
    assert response.status_code == 409
    assert response.get_json()["error"] == "category_in_use"


if __name__ == "__main__":
    raise SystemExit(pytest.main([str(Path(__file__).resolve()), "-q"]))
