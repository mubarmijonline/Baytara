"""What the storage card reports: bytes on disk, not bytes the database believes in."""
import os
import time

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Lesson, User
from app.security import hash_password
from app.services import local_video


@pytest.fixture
def app(tmp_path):
    config = type("StorageTestConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'storage.sqlite'}",
        "LOCAL_VIDEO_DIR": str(tmp_path / "videos"),
        "TESTING": True,
    })
    application = create_app(config)
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


def _admin_headers(client, app):
    with app.app_context():
        db.session.add(User(name="A", email="adm@t.test", phone="+201000000000",
                            password_hash=hash_password("secret12"), role="admin"))
        db.session.commit()
    token = client.post("/api/v1/auth/login", json={
        "email": "adm@t.test", "password": "secret12",
    }).get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_usage_counts_what_is_on_disk(app):
    root = local_video.video_root(app)
    (root / "7" / "480p").mkdir(parents=True)
    (root / "7" / "480p" / "seg0.ts").write_bytes(b"x" * 2048)
    (root / "7" / "enc.key").write_bytes(b"k" * 16)
    (root / "9").mkdir()
    (root / "9" / "seg0.ts").write_bytes(b"x" * 512)

    report = local_video.usage(app)
    assert report["videos_bytes"] == 2048 + 16 + 512
    assert report["video_count"] == 2
    # Biggest first, so the card can show what to delete without sorting again.
    assert [row["lesson_id"] for row in report["largest"]] == [7, 9]
    assert report["disk_total_bytes"] and report["disk_free_bytes"]


def test_usage_survives_an_empty_or_missing_directory(app):
    report = local_video.usage(app)          # nothing uploaded yet
    assert report["videos_bytes"] == 0 and report["video_count"] == 0
    assert report["largest"] == []
    assert report["disk_total_bytes"] is not None


def test_storage_endpoint_names_the_videos_and_is_admin_only(app):
    client = app.test_client()
    headers = _admin_headers(client, app)
    with app.app_context():
        lesson = Lesson(title="محاضرة كبيرة", position=0, status="published", access_type="free")
        db.session.add(lesson)
        db.session.commit()
        lesson_id = lesson.id

    root = local_video.video_root(app)
    (root / str(lesson_id)).mkdir(parents=True)
    (root / str(lesson_id) / "seg0.ts").write_bytes(b"x" * 4096)
    (root / "9999").mkdir()                   # a directory with no lesson behind it
    (root / "9999" / "seg0.ts").write_bytes(b"x" * 8)

    assert client.get("/api/v1/admin/storage").status_code == 401

    body = client.get("/api/v1/admin/storage", headers=headers).get_json()["storage"]
    assert body["videos_bytes"] == 4096 + 8
    biggest = body["largest"][0]
    assert biggest["lesson_id"] == lesson_id and biggest["title"] == "محاضرة كبيرة"
    # The orphan is reported with no title, which is how an admin spots it.
    orphan = [row for row in body["largest"] if row["lesson_id"] == 9999][0]
    assert orphan["title"] is None


def test_deleting_a_video_frees_its_disk_space(app):
    client = app.test_client()
    headers = _admin_headers(client, app)
    with app.app_context():
        lesson = Lesson(title="ملف محلي", position=0, status="published", access_type="free")
        db.session.add(lesson)
        db.session.commit()
        lesson_id = lesson.id

    folder = local_video.lesson_dir(app, lesson_id)
    folder.mkdir(parents=True)
    (folder / "seg0.ts").write_bytes(b"x" * 2048)
    assert local_video.usage(app)["videos_bytes"] == 2048

    assert client.delete(f"/api/v1/admin/videos/{lesson_id}", headers=headers).status_code == 200

    # Row and files go together: a deleted video must not keep counting against the disk.
    assert not folder.exists()
    assert local_video.usage(app)["videos_bytes"] == 0
    with app.app_context():
        assert db.session.get(Lesson, lesson_id) is None


def test_a_video_in_use_is_refused_and_keeps_its_files(app):
    from app.models import Category, Course, CourseVideo

    client = app.test_client()
    headers = _admin_headers(client, app)
    with app.app_context():
        lesson = Lesson(title="قيد الاستخدام", position=0, status="published", access_type="free")
        instructor = User(name="I", email="ins@t.test", password_hash=hash_password("secret12"),
                          role="instructor")
        category = Category(name="C", slug="c-in-use")
        db.session.add_all([lesson, instructor, category])
        db.session.flush()
        course = Course(title="K", slug="k-in-use", price=0, instructor_id=instructor.id,
                        category_id=category.id, status="published", access_type="free")
        db.session.add(course)
        db.session.flush()
        # The video sits inside a course, so deleting it would tear a hole in that course.
        db.session.add(CourseVideo(course_id=course.id, video_id=lesson.id, position=0))
        db.session.commit()
        lesson_id = lesson.id

    folder = local_video.lesson_dir(app, lesson_id)
    folder.mkdir(parents=True)
    (folder / "seg0.ts").write_bytes(b"x" * 512)

    refused = client.delete(f"/api/v1/admin/videos/{lesson_id}", headers=headers)
    assert refused.status_code == 409 and refused.get_json()["error"] == "video_in_use"
    # A refusal must not be half-done: the files are still there.
    assert (folder / "seg0.ts").exists()


def test_interrupted_packaging_resumes_when_the_source_survived(app, monkeypatch):
    from app.api.v1 import admin as admin_api

    with app.app_context():
        lesson = Lesson(title="نصف مُحوَّل", position=0, status="published", access_type="free",
                        source="local", local_status="packaging")
        db.session.add(lesson)
        db.session.commit()
        lesson_id = lesson.id

    incoming = local_video.video_root(app) / "_incoming"
    incoming.mkdir(parents=True)
    source = incoming / f"{lesson_id}_abcd1234_clip.mp4"
    source.write_bytes(b"not really a video")

    started = []
    # The real worker would run ffmpeg; the question here is only whether it is asked to.
    monkeypatch.setattr(admin_api, "_package_local_video",
                        lambda application, lid, path: started.append((lid, path)))

    admin_api.resume_interrupted_packaging(app)

    # Threads are daemons, so give the scheduler a moment to run them.
    for _ in range(50):
        if started:
            break
        time.sleep(0.02)
    assert started and started[0][0] == lesson_id
    with app.app_context():
        assert db.session.get(Lesson, lesson_id).local_status == "packaging"


def test_interrupted_packaging_fails_loudly_when_the_source_is_gone(app):
    from app.api.v1 import admin as admin_api

    with app.app_context():
        lesson = Lesson(title="مفقود", position=0, status="published", access_type="free",
                        source="local", local_status="packaging")
        db.session.add(lesson)
        db.session.commit()
        lesson_id = lesson.id

    # Half-written renditions with no source to finish them are just wasted disk.
    folder = local_video.lesson_dir(app, lesson_id)
    folder.mkdir(parents=True)
    (folder / "seg0.ts").write_bytes(b"x" * 4096)

    admin_api.resume_interrupted_packaging(app)

    with app.app_context():
        stuck = db.session.get(Lesson, lesson_id)
        assert stuck.local_status == "failed"
        assert stuck.local_error == "packaging_interrupted_source_missing"
    assert not folder.exists()
