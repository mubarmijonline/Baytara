"""Learning-API self-check: enroll -> progress -> completion %. Needs DATABASE_URL.

Run: python -m tests.test_learning
"""
import uuid

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, CourseModule, CourseVideo, Enrollment, Lesson, LessonProgress, User
from app.security import hash_password


@pytest.fixture
def learning_app(tmp_path):
    config = type("LearningConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'learning.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        instructor = User(name="Instructor", email="progress-instructor@example.test",
                          password_hash="hash", role="instructor")
        student = User(name="Student", email="progress-student@example.test",
                       password_hash=hash_password("secret12"), role="student")
        category = Category(name="Progress category", slug="progress-category")
        db.session.add_all([instructor, student, category])
        db.session.flush()
        source = Course(
            title="Source", slug="progress-source", instructor_id=instructor.id,
            category_id=category.id, access_type="free", status="published",
        )
        unrelated = Course(
            title="Unrelated", slug="progress-unrelated", instructor_id=instructor.id,
            category_id=category.id, access_type="free", status="published",
        )
        db.session.add_all([source, unrelated])
        db.session.flush()
        video = Lesson(title="Reusable progress video")
        module = CourseModule(course_id=unrelated.id, title="Legacy module")
        direct_legacy = Lesson(course_id=unrelated.id, title="Direct legacy")
        module_legacy = Lesson(module=module, title="Module legacy")
        db.session.add_all([video, module, direct_legacy, module_legacy])
        db.session.flush()
        db.session.add_all([
            CourseVideo(course_id=source.id, video_id=video.id, position=0),
            Enrollment(user_id=student.id, course_id=unrelated.id, status="active"),
        ])
        db.session.commit()
        data = {
            "source_id": source.id, "unrelated_id": unrelated.id, "video_id": video.id,
            "direct_legacy_id": direct_legacy.id, "module_legacy_id": module_legacy.id,
        }
        yield app, data
        db.session.remove()
        db.drop_all()


def test_progress_requires_video_membership_in_supplied_enrollment_course(learning_app):
    app, data = learning_app
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "progress-student@example.test", "password": "secret12",
    })
    headers = {"Authorization": f"Bearer {login.get_json()['access_token']}"}

    denied = client.post("/api/v1/progress", headers=headers, json={
        "course_id": data["unrelated_id"], "lesson_id": data["video_id"], "completed": True,
    })
    assert denied.status_code == 403
    assert denied.get_json()["error"] == "not_enrolled"

    for legacy_id in (data["direct_legacy_id"], data["module_legacy_id"]):
        legacy = client.post("/api/v1/progress", headers=headers, json={
            "course_id": data["unrelated_id"], "lesson_id": legacy_id, "completed": True,
        })
        assert legacy.status_code == 403
        assert legacy.get_json()["error"] == "not_enrolled"

    with app.app_context():
        db.session.add(CourseVideo(
            course_id=data["unrelated_id"], video_id=data["video_id"], position=0,
        ))
        db.session.commit()
    accepted = client.post("/api/v1/progress", headers=headers, json={
        "course_id": data["unrelated_id"], "lesson_id": data["video_id"], "completed": True,
    })
    assert accepted.status_code == 200, accepted.get_json()
    assert accepted.get_json()["progress"] == {
        "percent": 100, "completed_lessons": 1, "total_lessons": 1,
    }


def test_enrollments_report_watched_lessons_that_are_not_completed(learning_app):
    app, data = learning_app
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "progress-student@example.test", "password": "secret12",
    })
    headers = {"Authorization": f"Bearer {login.get_json()['access_token']}"}

    with app.app_context():
        student = User.query.filter_by(email="progress-student@example.test").first()
        enrollment = Enrollment(user_id=student.id, course_id=data["source_id"], status="active")
        db.session.add(enrollment)
        db.session.flush()
        db.session.add(LessonProgress(
            enrollment_id=enrollment.id,
            lesson_id=data["video_id"],
            watched_seconds=90,
        ))
        db.session.commit()

    response = client.get("/api/v1/enrollments", headers=headers)

    assert response.status_code == 200
    enrollment = next(
        item for item in response.get_json()["enrollments"]
        if item["course"]["id"] == data["source_id"]
    )
    progress = enrollment["progress"]
    assert progress["watched_lessons"] == 1
    assert progress["watched_not_completed"] == 1
    assert progress["completed_lessons"] == 0


def _seed(tag, price=0):
    instr = User(name="د", email=f"i_{tag}@t.test", password_hash=hash_password("secret12"), role="instructor")
    db.session.add(instr)
    db.session.flush()
    cat = Category(name=f"C{tag}", slug=f"c-{tag}")
    db.session.add(cat)
    db.session.flush()
    course = Course(title=f"K{tag}", slug=f"k-{tag}", price=price, instructor_id=instr.id,
                    category_id=cat.id, status="published",
                    access_type=("general" if price else "free"))
    db.session.add(course)
    db.session.flush()
    lessons = [Lesson(course_id=course.id, title=f"L{i}", position=i) for i in range(2)]
    db.session.add_all(lessons)
    db.session.flush()
    db.session.add_all([
        CourseVideo(course_id=course.id, video_id=lesson.id, position=lesson.position)
        for lesson in lessons
    ])
    db.session.commit()
    return course.id, [l.id for l in lessons]


def _auth(c, tag):
    email = f"s_{tag}@t.test"
    c.post("/api/v1/auth/register", json={
        "name": "S", "email": email, "phone": "+201000000000", "password": "secret12",
    })
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).get_json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        free_course, free_lessons = _seed(f"free{tag}", price=0)
        paid_course, _ = _seed(f"paid{tag}", price=199)

    c = app.test_client()
    h = _auth(c, tag)

    # auth required
    assert c.get("/api/v1/enrollments").status_code == 401

    # paid course self-enroll rejected (payment comes in Phase 4)
    assert c.post("/api/v1/enrollments", json={"course_id": paid_course}, headers=h).status_code == 402

    # free enroll ok, idempotent
    assert c.post("/api/v1/enrollments", json={"course_id": free_course}, headers=h).status_code == 201
    assert c.post("/api/v1/enrollments", json={"course_id": free_course}, headers=h).status_code == 200

    # progress on non-enrolled lesson denied
    with app.app_context():
        other, other_lessons = _seed(f"other{tag}", price=0)
    assert c.post("/api/v1/progress", json={"lesson_id": other_lessons[0]}, headers=h).status_code == 403

    # complete 1 of 2 lessons -> 50%
    r = c.post("/api/v1/progress", json={"lesson_id": free_lessons[0], "completed": True}, headers=h)
    assert r.status_code == 200 and r.get_json()["progress"]["percent"] == 50, r.get_json()
    # complete both -> 100%
    r = c.post("/api/v1/progress", json={"lesson_id": free_lessons[1], "completed": True}, headers=h)
    assert r.get_json()["progress"]["percent"] == 100

    # my enrollments reflects the 100%
    enr = c.get("/api/v1/enrollments", headers=h).get_json()["enrollments"]
    assert enr[0]["progress"]["percent"] == 100

    # persisted per-lesson progress is readable back (survives reload)
    with app.app_context():
        from app.models import Course
        slug = db.session.get(Course, free_course).slug
    prog = c.get(f"/api/v1/progress?course={slug}", headers=h)
    assert prog.status_code == 200, prog.get_json()
    body = prog.get_json()
    assert body["enrolled"] is True and body["percent"] == 100
    assert all(v["completed"] for v in body["lessons"].values()) and len(body["lessons"]) == 2

    print("learning self-check OK")


if __name__ == "__main__":
    demo()
