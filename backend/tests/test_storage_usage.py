"""What the storage card reports: bytes on disk, not bytes the database believes in."""
import os

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
