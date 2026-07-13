"""VdoCipher playback self-check (provider mocked). Needs DATABASE_URL.

Run: python -m tests.test_video
Verifies access gating: not-enrolled -> 403, no-video -> 409, enrolled+video -> OTP.
"""
import uuid

import app.services.video_provider as vp
from app import create_app
from app.extensions import db
from app.models import Category, Course, CourseModule, Lesson, User, Enrollment
from app.security import hash_password


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
                        category_id=cat.id, status="published")
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
