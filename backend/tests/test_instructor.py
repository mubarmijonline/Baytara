"""Instructor portal self-check: isolation (foreign -> 404) + video permission gating.

Run: python -m tests.test_instructor  (needs DATABASE_URL)
"""
import uuid

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import (
    Bundle, Category, Course, CourseModule, CourseVideo, Enrollment, Lesson, LessonProgress,
    User, VideoEntitlement,
)
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
            role="instructor", can_add_video=True, can_edit_video=False, can_delete_video=False,
        )
        other = User(
            name="Other", email="canonical-other@example.test", password_hash=hash_password("secret12"),
            role="instructor", can_add_video=True, can_edit_video=True, can_delete_video=True,
        )
        student = User(name="Student", email="canonical-student@example.test",
                       password_hash="hash", role="student")
        category = Category(name="Instructor category", slug="instructor-category")
        db.session.add_all([owner, other, student, category])
        db.session.flush()
        owned_course = Course(
            title="Owned", slug="canonical-owned", instructor_id=owner.id, category_id=category.id,
            access_type="general", price=100,
        )
        foreign_course = Course(
            title="Foreign", slug="canonical-foreign", instructor_id=other.id, category_id=category.id,
        )
        db.session.add_all([owned_course, foreign_course])
        db.session.flush()
        owned_module = CourseModule(course_id=owned_course.id, title="Owned module")
        canonical = Lesson(title="Canonical", vdocipher_video_id="canonical-provider")
        legacy = Lesson(module=owned_module, title="Legacy")
        db.session.add_all([owned_module, canonical, legacy])
        db.session.flush()
        enrollment = Enrollment(user_id=student.id, course_id=owned_course.id, status="active")
        package = Bundle(
            title="Protected package", slug="instructor-protected-package", access_type="general",
            price=100, courses=[owned_course], videos=[canonical],
        )
        db.session.add_all([
            CourseVideo(course_id=owned_course.id, video_id=canonical.id, position=4),
            enrollment,
            VideoEntitlement(user_id=student.id, video_id=canonical.id, status="active"),
            package,
        ])
        db.session.flush()
        progress = LessonProgress(enrollment_id=enrollment.id, lesson_id=canonical.id, watched_seconds=10)
        db.session.add(progress)
        db.session.commit()
        ids = {
            "owner": owner.id, "foreign_course": foreign_course.id, "course": owned_course.id,
            "module": owned_module.id, "video": canonical.id, "legacy": legacy.id,
            "package": package.id, "progress": progress.id,
        }

    client = instructor_app.test_client()
    owner_headers = _login_headers(client, "canonical-owner@example.test")
    other_headers = _login_headers(client, "canonical-other@example.test")

    detail = client.get(f"/api/v1/instructor/courses/{ids['course']}", headers=owner_headers)
    assert detail.status_code == 200
    serialized_ids = [video["id"] for video in detail.get_json()["course"]["videos"]]
    assert serialized_ids[0] == ids["video"]
    assert ids["legacy"] in serialized_ids

    denied_edit = client.patch(f"/api/v1/instructor/lessons/{ids['video']}", headers=owner_headers,
                               json={"title": "Denied metadata"})
    assert denied_edit.status_code == 403
    assert denied_edit.get_json()["error"] == "video_edit_forbidden"

    legacy_edit = client.patch(f"/api/v1/instructor/lessons/{ids['legacy']}", headers=owner_headers,
                               json={"title": "Legacy updated"})
    assert legacy_edit.status_code == 200

    with instructor_app.app_context():
        owner = db.session.get(User, ids["owner"])
        owner.can_edit_video = True
        db.session.commit()
    edited = client.patch(f"/api/v1/instructor/lessons/{ids['video']}", headers=owner_headers,
                          json={"title": "Canonical updated"})
    assert edited.status_code == 200, edited.get_json()
    assert client.patch(f"/api/v1/instructor/lessons/{ids['video']}", headers=other_headers,
                        json={"vdocipher_video_id": "forbidden"}).status_code == 404

    with instructor_app.app_context():
        db.session.add(CourseVideo(
            course_id=ids["foreign_course"], video_id=ids["video"], position=0,
        ))
        db.session.commit()
    shared_edit = client.patch(f"/api/v1/instructor/lessons/{ids['video']}", headers=owner_headers,
                               json={"title": "Cross-owner mutation"})
    assert shared_edit.status_code == 403
    assert shared_edit.get_json()["error"] == "shared_video_admin_required"
    with instructor_app.app_context():
        assert db.session.get(Lesson, ids["video"]).title == "Canonical updated"

    legacy_delete = client.delete(
        f"/api/v1/instructor/lessons/{ids['legacy']}", headers=owner_headers,
    )
    assert legacy_delete.status_code == 200
    with instructor_app.app_context():
        assert db.session.get(Lesson, ids["legacy"]) is None

    created = client.post(f"/api/v1/instructor/modules/{ids['module']}/lessons", headers=owner_headers,
                          json={"title": "Created canonical"})
    assert created.status_code == 201, created.get_json()
    created_id = created.get_json()["lesson"]["id"]
    with instructor_app.app_context():
        assert CourseVideo.query.filter_by(course_id=ids["course"], video_id=created_id).count() == 1
        owner = db.session.get(User, ids["owner"])
        owner.can_add_video = False
        db.session.commit()

    denied = client.post(f"/api/v1/instructor/modules/{ids['module']}/lessons", headers=owner_headers,
                         json={"title": "Denied without provider"})
    assert denied.status_code == 403
    assert denied.get_json()["error"] == "video_add_forbidden"
    with instructor_app.app_context():
        assert Lesson.query.filter_by(title="Denied without provider").count() == 0
    assert client.delete(f"/api/v1/instructor/lessons/{ids['video']}", headers=owner_headers).status_code == 403

    with instructor_app.app_context():
        owner = db.session.get(User, ids["owner"])
        owner.can_delete_video = True
        db.session.commit()
    deleted = client.delete(f"/api/v1/instructor/lessons/{ids['video']}", headers=owner_headers)
    assert deleted.status_code == 200, deleted.get_json()
    with instructor_app.app_context():
        video = db.session.get(Lesson, ids["video"])
        assert video is not None and video.vdocipher_video_id == "canonical-provider"
        assert CourseVideo.query.filter_by(course_id=ids["course"], video_id=ids["video"]).count() == 0
        assert CourseVideo.query.filter_by(
            course_id=ids["foreign_course"], video_id=ids["video"],
        ).count() == 1
        assert db.session.get(Bundle, ids["package"]).videos == [video]
        assert db.session.get(LessonProgress, ids["progress"]) is not None
        assert VideoEntitlement.query.filter_by(video_id=ids["video"]).count() == 1


def test_instructor_course_update_preserves_package_audience(instructor_app):
    with instructor_app.app_context():
        owner = User(
            name="Owner", email="package-owner@example.test", password_hash=hash_password("secret12"),
            role="instructor",
        )
        category = Category(name="Package category", slug="instructor-package-category")
        db.session.add_all([owner, category])
        db.session.flush()
        course = Course(
            title="General course", slug="instructor-package-course", instructor_id=owner.id,
            category_id=category.id, access_type="general", price=100,
        )
        package = Bundle(
            title="General package", slug="instructor-course-package", access_type="general",
            price=100, courses=[course],
        )
        db.session.add(package)
        db.session.commit()
        course_id = course.id

    client = instructor_app.test_client()
    headers = _login_headers(client, "package-owner@example.test")
    response = client.patch(f"/api/v1/instructor/courses/{course_id}", headers=headers, json={
        "access_type": "baytarian",
    })
    assert response.status_code == 422
    assert response.get_json()["errors"] == ["incompatible_course_audience"]
    with instructor_app.app_context():
        assert db.session.get(Course, course_id).access_type == "general"


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
    lesson = c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=A, json={
        "title": "L", "vdocipher_video_id": "VID1",
    }).get_json()["lesson"]

    # B cannot add a lesson to A's module
    assert c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=B, json={"title": "x"}).status_code == 404

    # editing an existing video needs can_edit_video (default false) -> 403
    assert c.patch(f"/api/v1/instructor/lessons/{lesson['id']}", headers=A,
                   json={"vdocipher_video_id": "VID2"}).status_code == 403

    # admin revokes can_add_video -> new video add now forbidden
    c.patch(f"/api/v1/admin/users/{aid}", headers=admin, json={"can_add_video": False})
    assert c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=A,
                  json={"title": "L2"}).status_code == 403

    # stats scoped to A
    st = c.get("/api/v1/instructor/stats", headers=A).get_json()
    assert st["courses"] == 1 and st["published"] == 1
    # B's stats see none of A's
    assert c.get("/api/v1/instructor/stats", headers=B).get_json()["courses"] == 0

    print("instructor portal self-check OK")


if __name__ == "__main__":
    demo()
