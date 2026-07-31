"""VdoCipher playback self-check (provider mocked). Needs DATABASE_URL.

Run: python -m tests.test_video
Verifies access gating: not-enrolled -> 403, no-video -> 409, enrolled+video -> OTP.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

import app.services.video_provider as vp
from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import (
    Category, Course, CourseModule, CourseVideo, Lesson, User, Enrollment, VideoEntitlement,
)
from app.security import hash_password


@pytest.fixture
def playback_app(tmp_path, monkeypatch):
    config = type("PlaybackConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'playback.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)

    class FakeProvider:
        def issue_otp(self, video_id, annotate=None, ttl=300):
            return {"otp": f"otp-{video_id}", "playbackInfo": "playback-info"}

    import app.api.v1.video as video_api
    monkeypatch.setattr(video_api, "provider", FakeProvider())
    with app.app_context():
        db.create_all()
        instructor = User(
            name="Instructor", email="playback-instructor@example.test",
            password_hash=hash_password("secret12"), role="instructor",
        )
        student = User(
            name="Student", email="playback-student@example.test",
            password_hash=hash_password("secret12"), role="student",
        )
        category = Category(name="Playback category", slug="playback-category")
        db.session.add_all([instructor, student, category])
        db.session.flush()
        course = Course(
            title="Playback", slug="playback-course", instructor_id=instructor.id,
            category_id=category.id, status="published", access_type="general", price=100,
        )
        assigned = Lesson(
            title="Assigned", category_id=category.id, status="published", access_type="general",
            price=50, vdocipher_video_id="assigned-playback",
        )
        direct = Lesson(
            title="Direct", category_id=category.id, status="published", access_type="general",
            price=50, vdocipher_video_id="direct-playback",
        )
        db.session.add_all([course, assigned, direct])
        db.session.flush()
        db.session.add_all([
            CourseVideo(course_id=course.id, video_id=assigned.id, position=0),
            Enrollment(user_id=student.id, course_id=course.id, status="active"),
            VideoEntitlement(
                user_id=student.id, video_id=direct.id, source="purchase", status="active",
                expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            ),
        ])
        db.session.commit()
        data = {"assigned_id": assigned.id, "direct_id": direct.id}
        yield app, data
        db.session.remove()
        db.drop_all()


def _playback_headers(client, email):
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "secret12"})
    return {"Authorization": f"Bearer {login.get_json()['access_token']}"}


def test_playback_accepts_active_course_assignment_and_assigned_instructor(playback_app):
    app, data = playback_app
    client = app.test_client()
    student = _playback_headers(client, "playback-student@example.test")
    instructor = _playback_headers(client, "playback-instructor@example.test")

    student_response = client.post("/api/v1/video/playback", headers=student,
                                   json={"lesson_id": data["assigned_id"]})
    assert student_response.status_code == 200, student_response.get_json()
    instructor_response = client.post("/api/v1/video/playback", headers=instructor,
                                      json={"lesson_id": data["assigned_id"]})
    assert instructor_response.status_code == 200, instructor_response.get_json()


def test_playback_reports_expired_direct_entitlement(playback_app):
    app, data = playback_app
    client = app.test_client()
    headers = _playback_headers(client, "playback-student@example.test")
    response = client.post("/api/v1/video/playback", headers=headers,
                           json={"lesson_id": data["direct_id"]})
    assert response.status_code == 403
    assert response.get_json()["error"] == "access_expired"


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    captured = {}

    class FakeProvider:
        def issue_otp(self, video_id, annotate=None, ttl=300):
            captured["video_id"] = video_id
            captured["annotate"] = annotate
            return {"otp": "otp_" + video_id, "playbackInfo": "pbinfo"}

    vp.provider = FakeProvider()  # swap DRM vendor (proves the abstraction seam)
    # video.py imported `provider` by name; patch there too
    import app.api.v1.video as vid
    vid.provider = vp.provider

    with app.app_context():
        db.create_all()
        instr = User(name="د", email=f"vi_{tag}@t.test", password_hash=hash_password("secret12"), role="instructor")
        db.session.add(instr); db.session.flush()
        cat = Category(name=f"C{tag}", slug=f"c-{tag}"); db.session.add(cat); db.session.flush()
        course = Course(title=f"K{tag}", slug=f"k-{tag}", price=0, instructor_id=instr.id,
                        category_id=cat.id, status="published", access_type="free")
        db.session.add(course); db.session.flush()
        mod = CourseModule(course_id=course.id, title="M", position=0); db.session.add(mod); db.session.flush()
        vlesson = Lesson(module_id=mod.id, title="مع فيديو", position=0, vdocipher_video_id="VID123")
        plain = Lesson(module_id=mod.id, title="بدون فيديو", position=1)
        db.session.add_all([vlesson, plain]); db.session.commit()
        vid_id, plain_id, course_id = vlesson.id, plain.id, course.id

    c = app.test_client()
    email = f"vs_{tag}@t.test"
    c.post("/api/v1/auth/register", json={"name": "S", "email": email, "password": "secret12"})
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).get_json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    # auth required
    assert c.post("/api/v1/video/playback", json={"lesson_id": vid_id}).status_code == 401
    # enrolled? no -> 403 (access gated before any OTP)
    assert c.post("/api/v1/video/playback", json={"lesson_id": vid_id}, headers=h).status_code == 403

    # enroll (free), then: lesson without video -> 409
    c.post("/api/v1/enrollments", json={"course_id": course_id}, headers=h)
    assert c.post("/api/v1/video/playback", json={"lesson_id": plain_id}, headers=h).status_code == 409

    # enrolled + has video -> OTP + watermark carries viewer identity
    r = c.post("/api/v1/video/playback", json={"lesson_id": vid_id}, headers=h)
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["otp"] == "otp_VID123" and body["playbackInfo"] == "pbinfo"
    assert captured["video_id"] == "VID123"
    assert any(email in a["text"] for a in captured["annotate"])  # dynamic watermark

    # missing lesson -> 404
    assert c.post("/api/v1/video/playback", json={"lesson_id": 999999}, headers=h).status_code == 404

    print("video (vdocipher) self-check OK")


if __name__ == "__main__":
    demo()
