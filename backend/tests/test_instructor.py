"""Instructor portal self-check: isolation (foreign -> 404) + video permission gating.

Run: python -m tests.test_instructor  (needs DATABASE_URL)
"""
import uuid

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, CourseModule, CourseVideo, Lesson, User
from app.security import hash_password


@pytest.fixture
def instructor_app(tmp_path):
    config = type("InstructorConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'instructor.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def _login_headers(client, email):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "secret12"})
    return {"Authorization": f"Bearer {response.get_json()['access_token']}"}


def test_instructor_canonical_video_ownership_and_permissions(instructor_app):
    with instructor_app.app_context():
        owner = User(
            name="Owner", email="canonical-owner@example.test", password_hash=hash_password("secret12"),
            role="instructor", can_add_video=True, can_edit_video=True, can_delete_video=False,
        )
        other = User(
            name="Other", email="canonical-other@example.test", password_hash=hash_password("secret12"),
            role="instructor", can_add_video=True, can_edit_video=True, can_delete_video=True,
        )
        category = Category(name="Instructor category", slug="instructor-category")
        db.session.add_all([owner, other, category])
        db.session.flush()
        owned_course = Course(
            title="Owned", slug="canonical-owned", instructor_id=owner.id, category_id=category.id,
        )
        foreign_course = Course(
            title="Foreign", slug="canonical-foreign", instructor_id=other.id, category_id=category.id,
        )
        db.session.add_all([owned_course, foreign_course])
        db.session.flush()
        owned_module = CourseModule(course_id=owned_course.id, title="Owned module")
        canonical = Lesson(title="Canonical", vdocipher_video_id="canonical-provider")
        db.session.add_all([owned_module, canonical])
        db.session.flush()
        db.session.add(CourseVideo(course_id=owned_course.id, video_id=canonical.id, position=4))
        db.session.commit()
        ids = {
            "owner": owner.id, "course": owned_course.id, "module": owned_module.id,
            "video": canonical.id,
        }

    client = instructor_app.test_client()
    owner_headers = _login_headers(client, "canonical-owner@example.test")
    other_headers = _login_headers(client, "canonical-other@example.test")

    detail = client.get(f"/api/v1/instructor/courses/{ids['course']}", headers=owner_headers)
    assert detail.status_code == 200
    assert [video["id"] for video in detail.get_json()["course"]["videos"]] == [ids["video"]]

    edited = client.patch(f"/api/v1/instructor/lessons/{ids['video']}", headers=owner_headers,
                          json={"vdocipher_video_id": "canonical-provider-updated"})
    assert edited.status_code == 200, edited.get_json()
    assert client.patch(f"/api/v1/instructor/lessons/{ids['video']}", headers=other_headers,
                        json={"vdocipher_video_id": "forbidden"}).status_code == 404

    created = client.post(f"/api/v1/instructor/modules/{ids['module']}/lessons", headers=owner_headers,
                          json={"title": "Created canonical", "vdocipher_video_id": "created-provider"})
    assert created.status_code == 201, created.get_json()
    created_id = created.get_json()["lesson"]["id"]
    with instructor_app.app_context():
        assert CourseVideo.query.filter_by(course_id=ids["course"], video_id=created_id).count() == 1
        owner = db.session.get(User, ids["owner"])
        owner.can_add_video = False
        db.session.commit()

    denied = client.post(f"/api/v1/instructor/modules/{ids['module']}/lessons", headers=owner_headers,
                         json={"title": "Denied", "vdocipher_video_id": "denied-provider"})
    assert denied.status_code == 403
    assert denied.get_json()["error"] == "video_add_forbidden"
    assert client.delete(f"/api/v1/instructor/lessons/{ids['video']}", headers=owner_headers).status_code == 403


def _mk(c, app, tag, role):
    email = f"{role}_{tag}@t.test"
    with app.app_context():
        db.session.add(User(name=role, email=email, password_hash=hash_password("secret12"), role=role))
        db.session.commit()
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).get_json()["access_token"]
    with app.app_context():
        uid = User.query.filter_by(email=email).first().id
    return {"Authorization": f"Bearer {tok}"}, uid


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        category = Category(name=f"C{tag}", slug=f"c-{tag}")
        db.session.add(category)
        db.session.commit()
        category_id = category.id
    c = app.test_client()
    A, aid = _mk(c, app, tag, "instructor")
    B, bid = _mk(c, app, tag + "b", "instructor")
    admin, _ = _mk(c, app, tag, "admin")
    student, _ = _mk(c, app, tag, "student")

    # student blocked from instructor area
    assert c.get("/api/v1/instructor/stats", headers=student).status_code == 403

    # A creates a course (instructor_id forced to A)
    course = c.post("/api/v1/instructor/courses", headers=A, json={
        "title": "دورة A", "status": "published", "category_id": category_id,
        "access_type": "general", "price": 100,
    }).get_json()["course"]
    cid = course["id"]
    assert course["instructor"]["id"] == aid

    # isolation: B cannot see/edit/delete A's course -> 404 (not 403)
    assert c.get(f"/api/v1/instructor/courses/{cid}", headers=B).status_code == 404
    assert c.patch(f"/api/v1/instructor/courses/{cid}", headers=B, json={"title": "hack"}).status_code == 404
    assert c.delete(f"/api/v1/instructor/courses/{cid}", headers=B).status_code == 404
    assert c.post(f"/api/v1/instructor/courses/{cid}/modules", headers=B, json={"title": "x"}).status_code == 404
    # A can
    assert c.get(f"/api/v1/instructor/courses/{cid}", headers=A).status_code == 200
    mod = c.post(f"/api/v1/instructor/courses/{cid}/modules", headers=A, json={"title": "M"}).get_json()["module"]
    lesson = c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=A, json={"title": "L"}).get_json()["lesson"]

    # B cannot add a lesson to A's module
    assert c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=B, json={"title": "x"}).status_code == 404

    # video add allowed by default (can_add_video=true)
    assert c.patch(f"/api/v1/instructor/lessons/{lesson['id']}", headers=A,
                   json={"vdocipher_video_id": "VID1"}).status_code == 200
    # editing an existing video needs can_edit_video (default false) -> 403
    assert c.patch(f"/api/v1/instructor/lessons/{lesson['id']}", headers=A,
                   json={"vdocipher_video_id": "VID2"}).status_code == 403

    # admin revokes can_add_video -> new video add now forbidden
    c.patch(f"/api/v1/admin/users/{aid}", headers=admin, json={"can_add_video": False})
    l2 = c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=A, json={"title": "L2"}).get_json()["lesson"]
    assert c.patch(f"/api/v1/instructor/lessons/{l2['id']}", headers=A,
                   json={"vdocipher_video_id": "VID3"}).status_code == 403

    # stats scoped to A
    st = c.get("/api/v1/instructor/stats", headers=A).get_json()
    assert st["courses"] == 1 and st["published"] == 1
    # B's stats see none of A's
    assert c.get("/api/v1/instructor/stats", headers=B).get_json()["courses"] == 0

    print("instructor portal self-check OK")


if __name__ == "__main__":
    demo()
