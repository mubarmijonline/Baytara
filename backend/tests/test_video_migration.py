"""Moving a paid video from our disk to VdoCipher, end to end minus the vendor.

A real 6-second clip is packaged with the production packager, so the rebuild step reads a
genuine encrypted HLS package with the key on disk. Needs ffmpeg.
"""
import subprocess
import tempfile
from pathlib import Path

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Lesson
from app.services import local_video, video_migration
from app.services import vdocipher_admin as va


def make_clip(path):
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=6",
         "-f", "lavfi", "-i", "sine=frequency=440:duration=6",
         "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(path)],
        check=True, capture_output=True,
    )


@pytest.fixture
def app(tmp_path):
    videos = tmp_path / "videos"
    config = type("MigrationConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'migration.sqlite'}",
        "TESTING": True,
        "LOCAL_VIDEO_DIR": str(videos),
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        category = Category(name="C", slug="c-migration")
        db.session.add(category)
        db.session.flush()
        paid = Lesson(title="Paid on disk", position=0, status="published", access_type="general",
                      price=100, category_id=category.id, source="local", local_status="ready")
        free = Lesson(title="Free on disk", position=1, status="published", access_type="free",
                      category_id=category.id, source="local", local_status="ready")
        db.session.add_all([paid, free])
        db.session.commit()
        clip = tmp_path / "clip.mp4"
        make_clip(clip)
        local_video.package(clip, local_video.lesson_dir(app, paid.id))
        app.config["PAID_ID"], app.config["FREE_ID"] = paid.id, free.id
        yield app
        db.session.remove()


def test_dry_run_lists_offenders_and_changes_nothing(app):
    result = app.test_cli_runner().invoke(args=["migrate-paid-videos"])
    assert result.exit_code == 0, result.output
    assert "1 paid video(s)" in result.output
    assert "Paid on disk" in result.output and "Free on disk" not in result.output
    with app.app_context():
        assert db.session.get(Lesson, app.config["PAID_ID"]).source == "local"


def test_rebuild_produces_a_playable_mp4_from_the_encrypted_package(app, tmp_path):
    out = tmp_path / "rebuilt.mp4"
    with app.app_context():
        video_migration.rebuild_mp4(app, app.config["PAID_ID"], out)
    assert out.stat().st_size > 0
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration,format_name",
         "-of", "default=nw=1", str(out)], check=True, capture_output=True, text=True,
    ).stdout
    assert "mp4" in probe
    duration = float(next(line.split("=")[1] for line in probe.splitlines() if line.startswith("duration=")))
    assert 5.0 <= duration <= 7.5
    # the temporary playlist must not be left behind next to the segments
    with app.app_context():
        assert not any(local_video.lesson_dir(app, app.config["PAID_ID"]).rglob("_migrate.m3u8"))


def test_apply_uploads_switches_the_row_and_keeps_the_package(app, monkeypatch, tmp_path):
    posted = {}

    class FakeResponse:
        status_code = 201

    def fake_post(url, data=None, files=None, timeout=None):
        posted["url"] = url
        posted["data"] = dict(data)
        posted["file"] = files["file"][0]
        posted["bytes"] = len(files["file"][1].read())
        return FakeResponse()

    monkeypatch.setattr(video_migration.requests, "post", fake_post)
    monkeypatch.setattr(va, "ensure_platform_folders", lambda all_courses=False: {"standalone": "f-standalone"})
    monkeypatch.setattr(va, "create_upload", lambda title, folder_id: {
        "video_id": "vdo-new-123", "upload_link": "https://upload.example/s3",
        "fields": {"key": "k", "policy": "p"},
    })

    result = app.test_cli_runner().invoke(args=["migrate-paid-videos", "--apply", "--workdir", str(tmp_path)])
    assert result.exit_code == 0, result.output
    assert "uploaded as vdo-new-123" in result.output

    assert posted["url"] == "https://upload.example/s3"
    assert posted["data"]["success_action_status"] == "201"
    assert posted["data"]["key"] == "k"
    assert posted["bytes"] > 0
    with app.app_context():
        paid = db.session.get(Lesson, app.config["PAID_ID"])
        assert (paid.source, paid.vdocipher_video_id) == ("vdocipher", "vdo-new-123")
        # not deleted yet: cleanup is the separate, confirmed step
        assert paid.local_status == "ready"
        assert local_video.lesson_dir(app, paid.id).exists()
        # the free row was never a candidate
        assert db.session.get(Lesson, app.config["FREE_ID"]).source == "local"
    # nothing staged is left behind
    assert not list(tmp_path.glob("lesson-*.mp4"))


def test_cleanup_deletes_only_once_the_provider_reports_ready(app, monkeypatch):
    with app.app_context():
        paid = db.session.get(Lesson, app.config["PAID_ID"])
        paid.source, paid.vdocipher_video_id = "vdocipher", "vdo-new-123"
        db.session.commit()
        package = local_video.lesson_dir(app, paid.id)

    status = {"status": "queued"}
    monkeypatch.setattr(va, "get_video", lambda video_id: dict(status))

    runner = app.test_cli_runner()
    result = runner.invoke(args=["migrate-paid-videos", "--cleanup"])
    assert result.exit_code == 0, result.output
    assert "kept: VdoCipher status is 'queued'" in result.output
    assert package.exists()

    status["status"] = "ready"
    result = runner.invoke(args=["migrate-paid-videos", "--cleanup"])
    assert "local package deleted" in result.output
    assert not package.exists()
    with app.app_context():
        assert db.session.get(Lesson, app.config["PAID_ID"]).local_status is None


def test_a_failed_upload_leaves_the_row_and_the_package_untouched(app, monkeypatch, tmp_path):
    monkeypatch.setattr(va, "ensure_platform_folders", lambda all_courses=False: {"standalone": "f"})
    monkeypatch.setattr(va, "create_upload", lambda title, folder_id: {
        "video_id": "vdo-x", "upload_link": "https://upload.example/s3", "fields": {},
    })

    class Failed:
        status_code = 500

    monkeypatch.setattr(video_migration.requests, "post", lambda *a, **k: Failed())
    result = app.test_cli_runner().invoke(args=["migrate-paid-videos", "--apply", "--workdir", str(tmp_path)])
    assert result.exit_code == 0, result.output
    assert "FAILED: upload_failed_500" in result.output
    with app.app_context():
        paid = db.session.get(Lesson, app.config["PAID_ID"])
        assert (paid.source, paid.vdocipher_video_id) == ("local", None)
        assert local_video.lesson_dir(app, paid.id).exists()
