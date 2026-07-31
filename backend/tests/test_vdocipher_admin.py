"""Admin VdoCipher management self-check. Needs DATABASE_URL.

Run: python -m tests.test_vdocipher_admin
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import Category, Course, CourseVideo, Lesson, Setting, User
from app.security import hash_password


def _admin_headers(c, app, tag):
    with app.app_context():
        db.session.add(User(name="A", email=f"vda_{tag}@t.test",
                            password_hash=hash_password("secret12"), role="admin"))
        db.session.commit()
    tok = c.post(
        "/api/v1/auth/login",
        json={"email": f"vda_{tag}@t.test", "password": "secret12"},
    ).get_json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]

    import app.services.vdocipher_admin as va

    folders = {}

    class FakeClient:
        def list_videos(self, **params):
            return {
                "count": 1,
                "rows": [{"id": "VIDX", "title": "عنوان من VdoCipher", "length": 180, "status": "ready"}],
            }

        def search_folders(self, name):
            return {"folders": [v for v in folders.values() if v["name"] == name]}

        def create_folder(self, name, parent="root"):
            fid = f"folder-{len(folders) + 1}"
            folders[fid] = {"id": fid, "name": name, "parent": parent}
            return {"id": fid, "name": name}

        def create_upload(self, title, folder_id):
            self.upload = {"title": title, "folder_id": folder_id}
            return {
                "videoId": "UPLOAD1",
                "clientPayload": {
                    "uploadLink": "https://bucket.s3.amazonaws.com",
                    "policy": "policy",
                    "key": "key",
                    "x-amz-signature": "signature",
                },
            }

    va.client = FakeClient()

    with app.app_context():
        db.create_all()
        instr = User(
            name="I",
            email=f"vdi_{tag}@t.test",
            password_hash=hash_password("secret12"),
            role="instructor",
        )
        db.session.add(instr)
        db.session.flush()
        cat = Category(name=f"cat {tag}", slug=f"cat-{tag}")
        db.session.add(cat)
        db.session.flush()
        course = Course(
            title=f"دورة {tag}",
            slug=f"course-{tag}",
            instructor_id=instr.id,
            category_id=cat.id,
            status="published",
        )
        db.session.add(course)
        db.session.add(Setting(key="secret_vdocipher", value="fake-secret"))
        db.session.commit()
        course_id = course.id

    c = app.test_client()
    h = _admin_headers(c, app, tag)

    assert c.post("/api/v1/admin/vdocipher/test", headers=h).status_code == 200

    sync = c.post("/api/v1/admin/vdocipher/sync-folders", headers=h, json={"all_courses": True})
    assert sync.status_code == 200, sync.get_json()
    body = sync.get_json()
    assert body["folders"]["root"] and body["folders"]["standalone"]
    assert str(course_id) in body["folders"]["courses"]

    listed = c.get("/api/v1/admin/vdocipher/videos?q=عنوان", headers=h)
    assert listed.status_code == 200
    assert listed.get_json()["videos"][0]["id"] == "VIDX"

    upload = c.post(
        "/api/v1/admin/vdocipher/upload-credentials",
        headers=h,
        json={"title": "New upload", "course_id": course_id},
    )
    assert upload.status_code == 200, upload.get_json()
    assert upload.get_json() == {
        "video_id": "UPLOAD1",
        "upload_link": "https://bucket.s3.amazonaws.com",
        "fields": {"policy": "policy", "key": "key", "x-amz-signature": "signature"},
    }
    assert va.client.upload["folder_id"] == "folder-3"
    assert c.post(
        "/api/v1/admin/vdocipher/upload-credentials",
        headers=h,
        json={"title": "New upload", "course_id": 999999},
    ).status_code == 404
    assert c.post(
        "/api/v1/admin/vdocipher/upload-credentials", headers=h, json={"title": ""}
    ).status_code == 422

    imported = c.post(
        "/api/v1/admin/vdocipher/import",
        headers=h,
        json={"video_id": "VIDX", "title": "عنوان من VdoCipher", "duration_minutes": 3, "course_id": course_id},
    )
    assert imported.status_code == 201, imported.get_json()
    assert imported.get_json()["video"]["course_id"] is None
    assert {course["id"] for course in imported.get_json()["video"]["courses"]} == {course_id}

    reused = c.post(
        "/api/v1/admin/vdocipher/import",
        headers=h,
        json={"video_id": "VIDX", "title": "again", "course_id": course_id},
    )
    assert reused.status_code == 200
    assert reused.get_json()["reused"] is True

    with app.app_context():
        video = Lesson.query.filter_by(vdocipher_video_id="VIDX").one()
        assert video.course_id is None
        assert CourseVideo.query.filter_by(course_id=course_id, video_id=video.id).count() == 1

    print("vdocipher admin self-check OK")


if __name__ == "__main__":
    demo()
