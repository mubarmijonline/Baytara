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


# Filled by the catalog_data fixture so create_video can default the now-required
# category and instructor without every call site repeating them.
CATALOG_DEFAULTS = {}


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
        CATALOG_DEFAULTS.update({"category_id": category.id, "instructor_id": instructor.id})
        return {"category_id": category.id, "instructor_id": instructor.id,
                "courses": [course.id for course in courses]}


def create_video(client, **overrides):
    body = {"title": "Equine examination", "access_type": "free", **overrides}
    body.setdefault("category_id", CATALOG_DEFAULTS.get("category_id"))
    body.setdefault("instructor_id", CATALOG_DEFAULTS.get("instructor_id"))
    response = client.post("/api/v1/admin/videos", json=body)
    assert response.status_code == 201, response.get_json()
    return response.get_json()["video"]


def test_video_description_en_round_trips_through_admin_writes(admin_client, catalog_data, monkeypatch):
    from app.api.v1 import admin as admin_api

    created = create_video(
        admin_client, description="وصف عربي", description_en="English description",
    )
    assert created["description"] == "وصف عربي"
    assert created["description_en"] == "English description"

    updated = admin_client.patch(f"/api/v1/admin/videos/{created['id']}", json={
        "description_en": "Updated English description",
    })
    assert updated.status_code == 200
    assert updated.get_json()["video"]["description_en"] == "Updated English description"

    monkeypatch.setattr(admin_api.vdocipher_admin, "ensure_platform_folders", lambda *_: {"standalone": "root"})
    monkeypatch.setattr(admin_api.vdocipher_admin, "get_video", lambda *_: {
        "poster": "https://cdn.example.test/provider.jpg", "duration_seconds": 83,
    })
    imported = admin_client.post("/api/v1/admin/vdocipher/import", json={
        "video_id": "provider-description-en", "title": "Imported", "description": "Arabic",
        "description_en": "Imported English", "sync_provider_metadata": True, **CATALOG_DEFAULTS,
    })
    assert imported.status_code == 201
    assert imported.get_json()["video"]["description_en"] == "Imported English"
    assert imported.get_json()["video"]["poster"] == "https://cdn.example.test/provider.jpg"
    assert imported.get_json()["video"]["duration_minutes"] == 1


def test_assign_same_video_to_two_courses_and_reorder(admin_client, catalog_data):
    video = create_video(admin_client)
    first, second = catalog_data["courses"]

    assert admin_client.post(f"/api/v1/admin/videos/{video['id']}/courses",
                             json={"course_ids": [first, second]}).status_code == 200
    assert admin_client.put(f"/api/v1/admin/courses/{first}/videos/order",
                            json={"video_ids": [video['id']]}).status_code == 200

    payload = admin_client.get(f"/api/v1/admin/videos/{video['id']}").get_json()["video"]
    assert {course["id"] for course in payload["courses"]} == {first, second}


def test_add_course_assignment_preserves_existing_memberships(admin_client, catalog_data):
    video = create_video(admin_client)
    first, second = catalog_data["courses"]
    assert admin_client.post(
        f"/api/v1/admin/videos/{video['id']}/courses", json={"course_ids": [first]},
    ).status_code == 200

    added = admin_client.post(
        f"/api/v1/admin/videos/{video['id']}/courses/add", json={"course_ids": [second]},
    )
    assert added.status_code == 200
    assert {course["id"] for course in added.get_json()["video"]["courses"]} == {first, second}

    repeated = admin_client.post(
        f"/api/v1/admin/videos/{video['id']}/courses/add", json={"course_ids": [second]},
    )
    assert repeated.status_code == 200
    assert {course["id"] for course in repeated.get_json()["video"]["courses"]} == {first, second}


def test_admin_course_search_matches_arabic_and_english_titles(admin_client, app, catalog_data):
    first, second = catalog_data["courses"]
    with app.app_context():
        db.session.get(Course, first).title = "تشريح الخيول"
        db.session.get(Course, first).title_en = "Equine anatomy"
        db.session.get(Course, second).title = "رعاية الدواجن"
        db.session.get(Course, second).title_en = "Poultry care"
        db.session.commit()

    english = admin_client.get("/api/v1/admin/courses?q=Equine").get_json()["courses"]
    arabic = admin_client.get("/api/v1/admin/courses?q=الدواجن").get_json()["courses"]

    assert [course["id"] for course in english] == [first]
    assert [course["id"] for course in arabic] == [second]


def test_video_catalog_validates_canonical_fields_and_provider_id(admin_client, catalog_data):
    category_id = catalog_data["category_id"]
    create_video(admin_client, vdocipher_video_id="provider-duplicate")

    duplicate = admin_client.post("/api/v1/admin/videos", json={
        "title": "Duplicate", "access_type": "free", "vdocipher_video_id": "provider-duplicate",
        **CATALOG_DEFAULTS,
    })
    assert duplicate.status_code == 409
    assert duplicate.get_json()["error"] == "duplicate_video"

    invalid_category = admin_client.post("/api/v1/admin/videos", json={
        "title": "Invalid category", "access_type": "free", "category_id": 999999,
    })
    assert invalid_category.status_code == 422
    assert invalid_category.get_json()["errors"] == ["invalid_category"]

    unpublished = create_video(admin_client, title="Publish me")
    # Since 2026-09-19 a video may have no section: that is how the platform's own promo
    # and how-to clips are filed, and the home page is where they surface. A section that
    # IS given must still exist (checked above), and courses still require one.
    publish = admin_client.patch(f"/api/v1/admin/videos/{unpublished['id']}",
                                 json={"status": "published", "category_id": None})
    assert publish.status_code == 200
    assert publish.get_json()["video"]["category"] is None

    published = admin_client.patch(f"/api/v1/admin/videos/{unpublished['id']}", json={
        "status": "published", "category_id": category_id,
    })
    assert published.status_code == 200

    invalid_status = admin_client.post("/api/v1/admin/videos", json={
        "title": "Invalid status", "access_type": "free", "status": "encoding", **CATALOG_DEFAULTS,
    })
    assert invalid_status.status_code == 422
    assert invalid_status.get_json()["errors"] == ["invalid_status"]

    untyped_criteria = admin_client.post("/api/v1/admin/videos", json={
        "title": "Untyped criteria", "access_type": "free", "criteria": {"level": "advanced"},
        **CATALOG_DEFAULTS,
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
        "title": "Malformed course list", "access_type": "free", "course_ids": first, **CATALOG_DEFAULTS,
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
    assert set(body) >= {"items", "total", "page", "pages"}
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
        "video_id": "provider-canonical", "title": "Canonical import", "course_id": first, **CATALOG_DEFAULTS,
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


def test_video_cannot_be_attached_to_another_instructors_course(admin_client, catalog_data, app):
    """A video belongs to its instructor, so it may only join that person's courses."""
    with app.app_context():
        other = User(name="Other instructor", email="other-instructor@example.test",
                     password_hash="hash", role="instructor")
        db.session.add(other)
        db.session.flush()
        foreign = Course(title="Someone else's course", slug="foreign-video-catalog",
                         instructor_id=other.id)
        db.session.add(foreign)
        db.session.commit()
        foreign_id, other_id = foreign.id, other.id

    video = create_video(admin_client)
    rejected = admin_client.post(f"/api/v1/admin/videos/{video['id']}/courses",
                                json={"course_ids": [foreign_id]})
    assert rejected.status_code == 422, rejected.get_json()
    assert "course_instructor_mismatch" in str(rejected.get_json())

    # Its own instructor's course still attaches, and a mixed list is refused whole.
    own = catalog_data["courses"][0]
    assert admin_client.post(f"/api/v1/admin/videos/{video['id']}/courses",
                            json={"course_ids": [own]}).status_code == 200
    mixed = admin_client.post(f"/api/v1/admin/videos/{video['id']}/courses",
                             json={"course_ids": [own, foreign_id]})
    assert mixed.status_code == 422, mixed.get_json()

    # Handing the video to the other instructor makes their course the legal one.
    assert admin_client.patch(f"/api/v1/admin/videos/{video['id']}",
                              json={"instructor_id": other_id}).status_code == 200
    assert admin_client.post(f"/api/v1/admin/videos/{video['id']}/courses",
                            json={"course_ids": [foreign_id]}).status_code == 200


def test_user_listing_honours_per_page_and_the_active_filter(admin_client, catalog_data, app):
    """The instructor pickers ask for 100 active people; the endpoint used to pin the
    page at 20 and hand back deactivated accounts."""
    with app.app_context():
        db.session.add_all([
            User(name=f"Instructor {n}", email=f"bulk-{n}@example.test",
                 password_hash="hash", role="instructor", is_active=(n % 7 != 0))
            for n in range(25)
        ])
        db.session.commit()

    capped = admin_client.get("/api/v1/admin/users?role=instructor").get_json()
    assert len(capped["users"]) == 20                     # the default page

    full = admin_client.get("/api/v1/admin/users?role=instructor&per_page=100").get_json()
    assert len(full["users"]) == full["total"] > 20

    active = admin_client.get("/api/v1/admin/users?role=instructor&per_page=100&active=1").get_json()
    assert active["users"], active
    assert all(person["is_active"] for person in active["users"])
    assert active["total"] < full["total"]                # the deactivated ones are gone

    # ...but whoever a record already points at stays selectable.
    disabled = next(p for p in full["users"] if not p["is_active"])
    kept = admin_client.get(
        f"/api/v1/admin/users?role=instructor&per_page=100&active=1&include={disabled['id']}",
    ).get_json()
    assert any(person["id"] == disabled["id"] for person in kept["users"])


def test_deleting_an_instructor_reports_what_blocks_it_and_clears_their_own_rows(admin_client, catalog_data, app):
    """Authored content blocks the delete with a count of what to reassign. The
    account's own footprint (devices, entitlements, verification) is cleared, which
    used to raise an IntegrityError and surface as a 500 instead of a message."""
    from app.models import BaytarianRequest, UserDevice, VideoEntitlement

    owner = catalog_data["instructor_id"]
    video = create_video(admin_client)

    blocked = admin_client.delete(f"/api/v1/admin/users/{owner}")
    assert blocked.status_code == 409, blocked.get_json()
    body = blocked.get_json()
    assert body["error"] == "user_has_courses"
    # The seeded video is free, and free videos are open content: they are handed to
    # nobody rather than keeping the account alive. The courses still block.
    assert body["courses"] == 2 and body["videos"] == 0, body

    # A paid video with no course does block: it was sold on that person's name.
    with app.app_context():
        loner = User(name="Video only", email="video-only@example.test",
                     password_hash="hash", role="instructor")
        db.session.add(loner)
        db.session.commit()
        loner_id = loner.id
    admin_client.patch(f"/api/v1/admin/videos/{video['id']}",
                       json={"instructor_id": loner_id, "access_type": "general", "price": 50})
    only_videos = admin_client.delete(f"/api/v1/admin/users/{loner_id}")
    assert only_videos.status_code == 409, only_videos.get_json()
    assert only_videos.get_json()["courses"] == 0 and only_videos.get_json()["videos"] == 1

    # Back to free, and the same account deletes with the video released to nobody.
    admin_client.patch(f"/api/v1/admin/videos/{video['id']}", json={"access_type": "free", "price": 0})
    assert admin_client.delete(f"/api/v1/admin/users/{loner_id}").status_code == 200

    # Someone who authored nothing but has signed in, bought a video and asked to be
    # verified deletes cleanly rather than tripping a foreign key.
    with app.app_context():
        learner = User(name="Learner", email="learner-delete@example.test",
                       password_hash="hash", role="student")
        db.session.add(learner)
        db.session.flush()
        db.session.add_all([
            UserDevice(user_id=learner.id, device_id="browser-1", label="Chrome"),
            VideoEntitlement(user_id=learner.id, video_id=video["id"], source="purchase"),
            BaytarianRequest(user_id=learner.id, status="pending"),
        ])
        db.session.commit()
        learner_id = learner.id

    removed = admin_client.delete(f"/api/v1/admin/users/{learner_id}")
    assert removed.status_code == 200, removed.get_json()
    with app.app_context():
        assert db.session.get(User, learner_id) is None
        assert UserDevice.query.filter_by(user_id=learner_id).count() == 0
        assert VideoEntitlement.query.filter_by(user_id=learner_id).count() == 0
        assert BaytarianRequest.query.filter_by(user_id=learner_id).count() == 0


def test_admin_user_email_is_validated_and_normalised(admin_client, app):
    """The reported case: "email: someone@yahoo.com" was pasted into the address box
    and stored verbatim, because the admin path only checked the field was non-empty."""
    base = {"name": "Prof", "password": "secret12", "role": "instructor"}

    for bad in ("email: ahmedragabm2005@yahoo.com", "not-an-email", "a@b", "  ", "two@@x.com"):
        response = admin_client.post("/api/v1/admin/users", json={**base, "email": bad})
        assert response.status_code == 422, (bad, response.get_json())

    # Stored trimmed and lowercased, so one person cannot arrive as two accounts.
    created = admin_client.post("/api/v1/admin/users",
                                json={**base, "email": "  AhmedRagab@Yahoo.COM  "})
    assert created.status_code == 201, created.get_json()
    uid = created.get_json()["user"]["id"]
    assert created.get_json()["user"]["email"] == "ahmedragab@yahoo.com"
    assert admin_client.post("/api/v1/admin/users",
                             json={**base, "email": "ahmedragab@yahoo.com"}).status_code == 409

    # A mistyped address can be corrected in place rather than needing a database edit.
    assert admin_client.patch(f"/api/v1/admin/users/{uid}",
                              json={"email": "email: x@y.com"}).status_code == 422
    fixed = admin_client.patch(f"/api/v1/admin/users/{uid}", json={"email": "Correct@Yahoo.com"})
    assert fixed.status_code == 200 and fixed.get_json()["user"]["email"] == "correct@yahoo.com"


def test_paid_video_cannot_be_uploaded_to_local_storage(app, admin_client, catalog_data):
    """Our server has no DRM. That trade is agreed for free content only, so a paid
    video is refused before a byte is read -- the check does not wait for the file."""
    created = admin_client.post("/api/v1/admin/videos", json={
        "title": "Paid lecture", "access_type": "general", "price": 150,
        **CATALOG_DEFAULTS,
    }).get_json()["video"]
    response = admin_client.post(f"/api/v1/admin/videos/{created['id']}/upload",
                                 data={}, content_type="multipart/form-data")
    assert response.status_code == 422
    assert response.get_json()["error"] == "paid_requires_vdocipher"


def test_local_video_cannot_be_repriced_as_paid(app, admin_client, catalog_data):
    """The same rule from the other direction: re-pricing a self-hosted video would put
    paid content behind no DRM at all."""
    created = admin_client.post("/api/v1/admin/videos", json={
        "title": "Free clip", "access_type": "free", **CATALOG_DEFAULTS,
    }).get_json()["video"]
    with app.app_context():
        lesson = db.session.get(Lesson, created["id"])
        lesson.source = "local"
        lesson.local_status = "ready"
        db.session.commit()
    response = admin_client.patch(f"/api/v1/admin/videos/{created['id']}",
                                  json={"access_type": "baytarian", "price": 99})
    assert response.status_code == 422
    assert response.get_json()["error"] == "paid_requires_vdocipher"
    # and a free re-save of the same row is still fine
    ok = admin_client.patch(f"/api/v1/admin/videos/{created['id']}", json={"title": "Free clip 2"})
    assert ok.status_code == 200, ok.get_json()


def test_video_list_and_detail_carry_play_counts(app, admin_client, catalog_data):
    """Plays are sessions that reached a first frame; viewers are distinct accounts. An
    OTP that was minted and never played is not a view, and a denied attempt is not one."""
    from datetime import datetime, timezone
    from app.models import VideoPlaybackSession

    created = admin_client.post("/api/v1/admin/videos", json={
        "title": "Watched clip", "access_type": "free", **CATALOG_DEFAULTS,
    }).get_json()["video"]
    with app.app_context():
        viewers = [User(name=f"V{i}", email=f"viewer{i}@example.test", password_hash="h", role="student")
                   for i in range(2)]
        db.session.add_all(viewers)
        db.session.flush()
        now = datetime.now(timezone.utc)

        def session(pid, user, played, status="playing"):
            return VideoPlaybackSession(
                public_id=pid, user_id=user.id, video_id=created["id"], video_title="Watched clip",
                access_type="free", status=status, started_at=now, last_event_at=now,
                first_played_at=now if played else None,
            )
        db.session.add_all([
            session("00000000-0000-4000-8000-000000000001", viewers[0], True),
            session("00000000-0000-4000-8000-000000000002", viewers[0], True),   # same person, twice
            session("00000000-0000-4000-8000-000000000003", viewers[1], True),
            session("00000000-0000-4000-8000-000000000004", viewers[1], False, status="issued"),
            session("00000000-0000-4000-8000-000000000005", viewers[1], False, status="denied"),
        ])
        db.session.commit()

    listed = admin_client.get("/api/v1/admin/videos").get_json()["items"]
    row = next(item for item in listed if item["id"] == created["id"])
    assert (row["plays"], row["viewers"]) == (3, 2)

    detail = admin_client.get(f"/api/v1/admin/videos/{created['id']}").get_json()["video"]
    assert (detail["plays"], detail["viewers"]) == (3, 2)


def test_course_content_carries_play_counts_per_video(app, admin_client, catalog_data):
    """The course screen lists videos from /courses/<id>, not /videos, so the counts have
    to ride on that payload too -- on the flat list and inside each unit."""
    from datetime import datetime, timezone
    from app.models import VideoPlaybackSession

    course_id = catalog_data["courses"][0]
    created = admin_client.post("/api/v1/admin/videos", json={
        "title": "In course", "access_type": "free", "course_ids": [course_id], **CATALOG_DEFAULTS,
    }).get_json()["video"]
    with app.app_context():
        viewer = User(name="V", email="course-viewer@example.test", password_hash="h", role="student")
        db.session.add(viewer)
        db.session.flush()
        now = datetime.now(timezone.utc)
        db.session.add(VideoPlaybackSession(
            public_id="00000000-0000-4000-8000-00000000c001", user_id=viewer.id, video_id=created["id"],
            video_title="In course", access_type="free", status="playing",
            started_at=now, last_event_at=now, first_played_at=now,
        ))
        db.session.commit()

    course = admin_client.get(f"/api/v1/admin/courses/{course_id}").get_json()["course"]
    flat = next(v for v in course["videos"] if v["id"] == created["id"])
    assert (flat["plays"], flat["viewers"]) == (1, 1)
    grouped = [v for unit in course["modules"] for v in unit["videos"] if v["id"] == created["id"]]
    assert grouped and grouped[0]["plays"] == 1


def test_a_video_outside_any_course_still_reports_its_play_count(app, admin_client, catalog_data):
    """The library serialises provider videos and everything else down two different
    paths. Only one of them counted plays, so a self-hosted video -- which is every video
    not on VdoCipher, in a course or not -- showed no figure at all."""
    from datetime import datetime, timezone
    from app.models import Lesson, VideoPlaybackSession

    created = admin_client.post("/api/v1/admin/videos", json={
        "title": "Standalone clip", "access_type": "free", **CATALOG_DEFAULTS,
    }).get_json()["video"]
    with app.app_context():
        lesson = db.session.get(Lesson, created["id"])
        lesson.source, lesson.local_status = "local", "ready"   # no provider id
        viewer = User(name="V", email="standalone-viewer@example.test",
                      password_hash="h", role="student")
        db.session.add(viewer)
        db.session.flush()
        now = datetime.now(timezone.utc)
        db.session.add(VideoPlaybackSession(
            public_id="00000000-0000-4000-8000-0000000000s1", user_id=viewer.id,
            video_id=lesson.id, video_title="Standalone clip", access_type="free",
            status="playing", started_at=now, last_event_at=now, first_played_at=now,
        ))
        db.session.commit()

    row = next(v for v in admin_client.get("/api/v1/admin/videos").get_json()["items"]
               if v["id"] == created["id"])
    assert (row["plays"], row["viewers"]) == (1, 1)
    detail = admin_client.get(f"/api/v1/admin/videos/{created['id']}").get_json()["video"]
    assert detail["plays"] == 1


def test_a_video_can_be_created_with_neither_a_section_nor_a_presenter(admin_client, catalog_data):
    """The client's own promo and how-to clips have neither, and the upload page sends
    both as an empty <select>. Number("") is 0, which used to be read as section zero and
    refused with invalid_category."""
    for payload in ({"category_id": None, "instructor_id": None},
                    {"category_id": 0, "instructor_id": 0},
                    {"category_id": "", "instructor_id": ""}):
        response = admin_client.post("/api/v1/admin/videos", json={
            "title": "Platform promo", "access_type": "free", **payload,
        })
        assert response.status_code == 201, response.get_json()
        video = response.get_json()["video"]
        assert video.get("category") in (None, {})
        assert video.get("instructor") in (None, {})


def test_a_section_or_presenter_that_is_named_still_has_to_exist(admin_client, catalog_data):
    refused = admin_client.post("/api/v1/admin/videos", json={
        "title": "Ghost section", "access_type": "free", "category_id": 99999,
    })
    assert refused.status_code == 422
    assert "invalid_category" in refused.get_json()["errors"]

    refused = admin_client.post("/api/v1/admin/videos", json={
        "title": "Ghost presenter", "access_type": "free", "instructor_id": 99999,
    })
    assert refused.status_code == 422
    assert "invalid_instructor" in refused.get_json()["errors"]
