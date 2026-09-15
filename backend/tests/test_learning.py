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
        paid_course, paid_lessons = _seed(f"paid{tag}", price=199)

    c = app.test_client()
    h = _auth(c, tag)

    # auth required
    assert c.get("/api/v1/enrollments").status_code == 401

    # paid course self-enroll rejected (payment comes in Phase 4)
    assert c.post("/api/v1/enrollments", json={"course_id": paid_course}, headers=h).status_code == 402

    # A course with no fee is watched, not joined: nothing is recorded and the answer
    # is the same however many times it is asked.
    for _ in range(2):
        free = c.post("/api/v1/enrollments", json={"course_id": free_course}, headers=h)
        assert free.status_code == 200 and free.get_json() == {"enrollment": None, "free": True}
    with app.app_context():
        from app.models import Enrollment
        assert Enrollment.query.filter_by(course_id=free_course).count() == 0

    # Progress hangs off an enrollment, so it belongs to a paid seat. Granted here the
    # way the payment flow grants it.
    with app.app_context():
        from app.models import Enrollment, User
        uid = User.query.filter_by(email=f"s_{tag}@t.test").one().id
        db.session.add(Enrollment(user_id=uid, course_id=paid_course, source="purchase", status="active"))
        db.session.commit()

    # progress on a course the learner has no seat in is denied
    with app.app_context():
        other, other_lessons = _seed(f"other{tag}", price=199)
    assert c.post("/api/v1/progress", json={"lesson_id": other_lessons[0]}, headers=h).status_code == 403

    # complete 1 of 2 lessons -> 50%
    r = c.post("/api/v1/progress", json={"lesson_id": paid_lessons[0], "completed": True}, headers=h)
    assert r.status_code == 200 and r.get_json()["progress"]["percent"] == 50, r.get_json()
    # complete both -> 100%
    r = c.post("/api/v1/progress", json={"lesson_id": paid_lessons[1], "completed": True}, headers=h)
    assert r.get_json()["progress"]["percent"] == 100

    # my enrollments reflects the 100%
    enr = c.get("/api/v1/enrollments", headers=h).get_json()["enrollments"]
    assert enr[0]["progress"]["percent"] == 100

    # persisted per-lesson progress is readable back (survives reload)
    with app.app_context():
        from app.models import Course
        slug = db.session.get(Course, paid_course).slug
    prog = c.get(f"/api/v1/progress?course={slug}", headers=h)
    assert prog.status_code == 200, prog.get_json()
    body = prog.get_json()
    assert body["enrolled"] is True and body["percent"] == 100
    assert all(v["completed"] for v in body["lessons"].values()) and len(body["lessons"]) == 2

    print("learning self-check OK")


if __name__ == "__main__":
    demo()


def _issued_certificate(app):
    """One real certificate row, without walking a whole course to completion."""
    from app.models import Certificate
    with app.app_context():
        user = User.query.filter_by(role="student").first() or User.query.first()
        course = Course.query.first()
        certificate = Certificate(serial=Certificate.new_serial(),
                                  user_id=user.id, course_id=course.id)
        db.session.add(certificate)
        db.session.commit()
        return certificate.serial


def test_certificate_qr_encodes_the_public_verification_link(learning_app):
    """The QR is what makes a printed certificate checkable, so it has to resolve to the
    same page the serial does -- and be a real PNG, because the sheet prints it."""
    app = learning_app[0] if isinstance(learning_app, tuple) else learning_app
    serial = _issued_certificate(app)
    client = app.test_client()

    response = client.get(f"/api/v1/certificates/{serial}/qr.png")
    assert response.status_code == 200, response.get_data()[:200]
    assert response.mimetype == "image/png"
    assert response.get_data()[:8] == b"\x89PNG\r\n\x1a\n"
    # a serial's link never changes, so it is worth caching
    assert "max-age" in response.headers.get("Cache-Control", "")

    # and it really does encode the verification URL, not just any image
    try:
        from pyzbar.pyzbar import decode        # optional; skipped when absent
        from PIL import Image
        import io as _io
        decoded = decode(Image.open(_io.BytesIO(response.get_data())))
        assert decoded, "QR did not decode"
        assert decoded[0].data.decode().endswith(f"/certificates/{serial}")
    except ImportError:
        pass


def test_certificate_qr_refuses_a_serial_that_does_not_exist(learning_app):
    """Otherwise the endpoint would mint a QR code for any string handed to it, which
    would scan happily and lead to a 404 -- a certificate that looks verifiable."""
    app = learning_app[0] if isinstance(learning_app, tuple) else learning_app
    response = app.test_client().get("/api/v1/certificates/BT-NOTREAL99/qr.png")
    assert response.status_code == 404
    assert response.get_json()["error"] == "not_found"


def test_certificate_qr_needs_no_account(learning_app):
    """Public, like the verification page it points at: whoever holds the serial can
    already read the page, and the image carries nothing further."""
    app = learning_app[0] if isinstance(learning_app, tuple) else learning_app
    serial = _issued_certificate(app)
    client = app.test_client()
    client.environ_base.pop("HTTP_AUTHORIZATION", None)
    assert client.get(f"/api/v1/certificates/{serial}/qr.png").status_code == 200
