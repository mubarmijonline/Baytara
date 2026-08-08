"""Instructor public profile self-check: admin fills the profile (photo upload, headline,
bio, expertise, section) and the public endpoints return it with REAL counts.

Run: python -m tests.test_instructor_profile  (needs DATABASE_URL)
"""
import io
import uuid

from app import create_app
from app.extensions import db
from app.models import User, Category, Course, Lesson
from app.security import hash_password


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        db.session.add(User(name="A", email=f"adm_{tag}@t.test",
                            password_hash=hash_password("secret12"), role="admin"))
        db.session.commit()

    c = app.test_client()
    tok = c.post("/api/v1/auth/login", json={"email": f"adm_{tag}@t.test", "password": "secret12"}).get_json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    cat = c.post("/api/v1/admin/categories", headers=h, json={"name": f"الخيول {tag}"}).get_json()["category"]

    # photo upload -> public URL that actually serves
    png = (b"\x89PNG\r\n\x1a\n" + b"\x00" * 32)
    up = c.post("/api/v1/admin/uploads/image", headers=h,
                data={"file": (io.BytesIO(png), "photo.png", "image/png")},
                content_type="multipart/form-data")
    assert up.status_code == 201, up.get_json()
    avatar = up.get_json()["url"]
    assert c.get(avatar).status_code == 200
    # a non-image is refused
    assert c.post("/api/v1/admin/uploads/image", headers=h,
                  data={"file": (io.BytesIO(b"x"), "n.txt", "text/plain")},
                  content_type="multipart/form-data").status_code == 415

    # instructor created complete in one call
    r = c.post("/api/v1/admin/users", headers=h, json={
        "name": "أ.د. محمد رفاعي", "email": f"ins_{tag}@t.test", "password": "secret12",
        "role": "instructor", "headline": "استشاري الخيول", "bio": "نبذة كاملة.",
        "expertise": ["الخيول", "التناسليات"], "category_id": cat["id"], "avatar_url": avatar,
    })
    assert r.status_code == 201, r.get_json()
    ins = r.get_json()["user"]
    assert ins["category"]["id"] == cat["id"] and ins["avatar_url"] == avatar

    # a published course with two videos of known length
    with app.app_context():
        course = Course(title=f"K{tag}", slug=f"k-{tag}", price=0, instructor_id=ins["id"],
                        category_id=cat["id"], status="published", access_type="free",
                        enrolled_count=7)
        db.session.add(course)
        db.session.flush()
        db.session.add_all([
            Lesson(course_id=course.id, title="فيديو ١", position=0, duration_minutes=20),
            Lesson(course_id=course.id, title="فيديو ٢", position=1, duration_minutes=40),
        ])
        db.session.commit()
        slug = course.slug

    # public profile: real profile fields + real counts (no placeholders)
    p = c.get(f"/api/v1/instructors/{ins['id']}").get_json()
    prof = p["instructor"]
    assert prof["headline"] == "استشاري الخيول" and prof["bio"] == "نبذة كاملة."
    assert prof["expertise"] == ["الخيول", "التناسليات"] and prof["avatar_url"] == avatar
    assert prof["category"]["id"] == cat["id"]
    assert (prof["courses"], prof["students"], prof["lessons"], prof["minutes"]) == (1, 7, 2, 60)
    assert len(p["courses"]) == 1

    # course payload carries the same real figures + the instructor's photo/headline
    cd = c.get(f"/api/v1/courses/{slug}").get_json()["course"]
    assert cd["lessons_count"] == 2 and cd["video_minutes"] == 60
    assert cd["instructor"]["avatar_url"] == avatar and cd["instructor"]["headline"] == "استشاري الخيول"
    assert [v["title"] for v in cd["videos"]] == ["فيديو ١", "فيديو ٢"]

    # listing shows the instructor with the same counts
    listed = [i for i in c.get("/api/v1/instructors").get_json()["instructors"] if i["id"] == ins["id"]]
    assert listed and listed[0]["students"] == 7

    print("instructor profile self-check OK")


if __name__ == "__main__":
    demo()
