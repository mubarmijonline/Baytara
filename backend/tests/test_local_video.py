"""Self-hosted video self-check: upload -> encrypted HLS -> gated playback.

Generates a real 6-second clip with ffmpeg, uploads it through the admin API, waits for the
background packaging, then proves the delivery rules:

  * playback returns a local URL and a watermark string, no VdoCipher call
  * the master playlist, rendition, key and segments need a valid token
  * a token for one video does not open another
  * segments really are AES-encrypted on disk
  * deleting the upload hands the video back to VdoCipher delivery

Run: python -m tests.test_local_video   (needs DATABASE_URL + ffmpeg)
"""
import os
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

from app import create_app
from app.extensions import db
from app.models import Category, Course, Lesson, User, Enrollment, CourseVideo
from app.security import hash_password


def make_clip(path):
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=6",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
         "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(path)],
        check=True, capture_output=True,
    )


def demo():
    tag = uuid.uuid4().hex[:8]
    video_dir = tempfile.mkdtemp(prefix="baytara-videos-")
    os.environ["LOCAL_VIDEO_DIR"] = video_dir
    app = create_app()
    app.config["LOCAL_VIDEO_DIR"] = video_dir

    with app.app_context():
        db.create_all()
        admin = User(name="A", email=f"adm_{tag}@t.test", phone="+201000000001",
                     password_hash=hash_password("secret12"), role="admin")
        instructor = User(name="I", email=f"ins_{tag}@t.test",
                          password_hash=hash_password("secret12"), role="instructor")
        db.session.add_all([admin, instructor])
        db.session.flush()
        category = Category(name=f"C{tag}", slug=f"c-{tag}")
        db.session.add(category)
        db.session.flush()
        course = Course(title=f"K{tag}", slug=f"k-{tag}", price=0, instructor_id=instructor.id,
                        category_id=category.id, status="published", access_type="free")
        db.session.add(course)
        db.session.flush()
        lesson = Lesson(title="محلي", position=0, status="published", access_type="free",
                        category_id=category.id, is_protected=False)
        other = Lesson(title="آخر", position=1, status="published", access_type="free",
                       category_id=category.id, is_protected=False)
        db.session.add_all([lesson, other])
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=lesson.id, position=0))
        db.session.commit()
        lesson_id, other_id, course_id = lesson.id, other.id, course.id

    c = app.test_client()
    admin_token = c.post("/api/v1/auth/login", json={
        "email": f"adm_{tag}@t.test", "password": "secret12", "device_id": "admin-dev",
    }).get_json()["access_token"]
    ah = {"Authorization": f"Bearer {admin_token}", "X-Baytara-Device-ID": "admin-dev"}

    # ---- upload ----
    with tempfile.TemporaryDirectory() as tmp:
        clip = Path(tmp) / "clip.mp4"
        make_clip(clip)
        with open(clip, "rb") as fh:
            r = c.post(f"/api/v1/admin/videos/{lesson_id}/upload", headers=ah,
                       data={"file": (fh, "clip.mp4", "video/mp4")},
                       content_type="multipart/form-data")
    assert r.status_code == 202, r.get_json()
    assert r.get_json()["video"]["source"] == "local"

    # a non-video is refused
    r = c.post(f"/api/v1/admin/videos/{lesson_id}/upload", headers=ah,
               data={"file": (tempfile.NamedTemporaryFile(suffix=".txt"), "x.txt", "text/plain")},
               content_type="multipart/form-data")
    assert r.status_code == 415, r.get_json()

    # ---- wait for the background packaging ----
    deadline = time.time() + 180
    status = None
    while time.time() < deadline:
        with app.app_context():
            status = db.session.get(Lesson, lesson_id).local_status
        if status in ("ready", "failed"):
            break
        time.sleep(2)
    with app.app_context():
        row = db.session.get(Lesson, lesson_id)
        assert row.local_status == "ready", f"packaging {row.local_status}: {row.local_error}"
        assert row.duration_minutes, "duration should come from ffprobe"
    print(f"packaged -> {status}")

    # segments on disk must be encrypted: an .ts starts with 0x47 in the clear
    seg = next(Path(video_dir, str(lesson_id), "480p").glob("seg_*.ts"))
    assert seg.read_bytes()[0] != 0x47, "segment is not encrypted"
    print("segments encrypted on disk")

    # ---- student playback ----
    email = f"s_{tag}@t.test"
    c.post("/api/v1/auth/register", json={"name": "S", "email": email, "phone": "+201000000002",
                                          "password": "secret12", "device_id": "dev-1"})
    token = c.post("/api/v1/auth/login", json={"email": email, "password": "secret12",
                                               "device_id": "dev-1"}).get_json()["access_token"]
    h = {"Authorization": f"Bearer {token}", "X-Baytara-Device-ID": "dev-1"}
    with app.app_context():
        uid = User.query.filter_by(email=email).first().id
        db.session.add(Enrollment(user_id=uid, course_id=course_id, source="purchase", status="active"))
        db.session.commit()

    r = c.post("/api/v1/video/playback", json={"lesson_id": lesson_id}, headers=h)
    assert r.status_code == 200, r.get_json()
    body = r.get_json()
    assert body["kind"] == "local" and "master.m3u8" in body["url"], body
    assert email in body["watermark"] and body["audio_mark"] == uid, body
    url = body["url"]
    token_value = url.split("t=")[1]
    print("playback issued a local URL + watermark")

    # ---- delivery rules ----
    assert c.get(f"/api/v1/video/hls/{lesson_id}/master.m3u8").status_code == 403      # no token
    assert c.get(f"/api/v1/video/hls/{lesson_id}/master.m3u8?t=nope.nope.nope.nope.nope").status_code == 403
    assert c.get(f"/api/v1/video/hls/{other_id}/master.m3u8?t={token_value}").status_code == 403  # wrong video

    master = c.get(url)
    assert master.status_code == 200 and "480p/index.m3u8" in master.get_data(as_text=True)
    rendition_url = [l for l in master.get_data(as_text=True).splitlines() if l.startswith("/api")][0]
    playlist = c.get(rendition_url)
    assert playlist.status_code == 200
    text = playlist.get_data(as_text=True)
    assert f"/api/v1/video/hls/{lesson_id}/key?t=" in text, text[:200]   # key URI rewritten
    assert "seg_0000.ts?t=" in text, text[:400]

    key = c.get(f"/api/v1/video/hls/{lesson_id}/key?t={token_value}")
    assert key.status_code == 200 and len(key.get_data()) == 16
    assert c.get(f"/api/v1/video/hls/{lesson_id}/key").status_code == 403

    seg_url = [l for l in text.splitlines() if l.startswith("/api") and ".ts" in l][0]
    assert c.get(seg_url).status_code == 200
    assert c.get(f"/api/v1/video/hls/{lesson_id}/480p/../../../etc/passwd?t={token_value}").status_code in (403, 404)
    print("token, key and segment rules hold")

    # public catalog lists a local video even without a VdoCipher id
    listed = c.get("/api/v1/videos").get_json()["videos"]
    assert any(v["id"] == lesson_id for v in listed), "local video missing from the catalog"

    # ---- delete brings it back to VdoCipher delivery ----
    r = c.delete(f"/api/v1/admin/videos/{lesson_id}/upload", headers=ah)
    assert r.status_code == 200 and r.get_json()["video"]["source"] == "vdocipher"
    assert not Path(video_dir, str(lesson_id)).exists()
    print("delete removed the files and reset the source")

    print("local video self-check OK")


if __name__ == "__main__":
    demo()
