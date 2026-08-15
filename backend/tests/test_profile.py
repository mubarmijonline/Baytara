"""Profile, certificate and activity self-check. Run: python -m tests.test_profile.

Covers the editable profile fields, the learner-facing image upload and its limits,
certificate issuance on course completion, public verification, and the derived feed.
"""
import io
import uuid

from app import create_app
from app.extensions import db
from app.models import Category, Certificate, Course, CourseVideo, Enrollment, Lesson, User
from app.security import hash_password


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        instr = User(name="د. اختبار", email=f"i_{tag}@baytara.test",
                     password_hash=hash_password("secret12"), role="instructor")
        student = User(name="طالب", email=f"s_{tag}@baytara.test", phone="+201000000000",
                       password_hash=hash_password("secret12"), role="student")
        db.session.add_all([instr, student])
        db.session.flush()
        cat = Category(name=f"Cat {tag}", slug=f"cat-{tag}")
        db.session.add(cat)
        db.session.flush()

        # one course that grants a certificate, one that does not
        with_cert = Course(title=f"With cert {tag}", slug=f"wc-{tag}", instructor_id=instr.id,
                           category_id=cat.id, status="published", access_type="free",
                           has_certificate=True)
        without = Course(title=f"No cert {tag}", slug=f"nc-{tag}", instructor_id=instr.id,
                         category_id=cat.id, status="published", access_type="free",
                         has_certificate=False)
        db.session.add_all([with_cert, without])
        db.session.flush()
        a = Lesson(title="A", position=0, duration_minutes=10)
        b = Lesson(title="B", position=1, duration_minutes=10)
        c_only = Lesson(title="C", position=0, duration_minutes=10)
        db.session.add_all([a, b, c_only])
        db.session.flush()
        db.session.add_all([
            CourseVideo(course_id=with_cert.id, video_id=a.id, position=0),
            CourseVideo(course_id=with_cert.id, video_id=b.id, position=1),
            CourseVideo(course_id=without.id, video_id=c_only.id, position=0),
            Enrollment(user_id=student.id, course_id=with_cert.id, status="active"),
            Enrollment(user_id=student.id, course_id=without.id, status="active"),
        ])
        db.session.commit()
        ids = (a.id, b.id, c_only.id, student.id)
    a_id, b_id, c_id, student_id = ids

    c = app.test_client()
    tok = c.post("/api/v1/auth/login",
                 json={"email": f"s_{tag}@baytara.test", "password": "secret12"}).get_json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}

    # ---- editable profile fields ----
    r = c.patch("/api/v1/auth/profile", headers=h, json={
        "name": "  د. محمد  ", "headline": "أمراض الماشية", "location": "القاهرة",
        "bio": "  تسعة أعوام ممارسة  ",
    })
    assert r.status_code == 200, r.get_json()
    user = r.get_json()["user"]
    assert user["name"] == "د. محمد" and user["bio"] == "تسعة أعوام ممارسة", user
    assert user["location"] == "القاهرة" and user["headline"] == "أمراض الماشية", user
    # editing other fields must not wipe the phone, which the watermark depends on
    assert user["phone"] == "+201000000000", user

    # a blank name is refused; role and email are not editable at all
    assert c.patch("/api/v1/auth/profile", headers=h, json={"name": "   "}).status_code == 422
    r = c.patch("/api/v1/auth/profile", headers=h, json={"role": "admin", "email": "x@y.test"})
    assert r.status_code == 200 and r.get_json()["user"]["role"] == "student", r.get_json()
    assert r.get_json()["user"]["email"] == f"s_{tag}@baytara.test"

    # a phone-only call still works, and an empty phone is still refused
    assert c.patch("/api/v1/auth/profile", headers=h, json={"phone": "+201111111111"}).status_code == 200
    assert c.patch("/api/v1/auth/profile", headers=h, json={"phone": "  "}).status_code == 422

    # ---- profile images ----
    png = (io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64), "me.png")
    r = c.post("/api/v1/auth/profile/image", headers=h,
               data={"kind": "avatar", "file": png}, content_type="multipart/form-data")
    assert r.status_code == 201, r.get_json()
    avatar = r.get_json()["user"]["avatar_url"]
    assert avatar.startswith("/api/v1/uploads/") and f"u{student_id}_avatar_" in avatar, avatar

    # the stored name is generated, so a traversal filename cannot escape the folder
    evil = (io.BytesIO(b"\x89PNG\r\n\x1a\n"), "../../etc/passwd.png")
    r = c.post("/api/v1/auth/profile/image", headers=h,
               data={"kind": "cover", "file": evil}, content_type="multipart/form-data")
    assert r.status_code == 201, r.get_json()
    assert ".." not in r.get_json()["url"], r.get_json()

    # type and size are enforced
    bad_type = (io.BytesIO(b"MZ"), "x.exe")
    assert c.post("/api/v1/auth/profile/image", headers=h,
                  data={"kind": "avatar", "file": bad_type},
                  content_type="multipart/form-data").status_code == 415
    huge = (io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * (5 * 1024 * 1024 + 10)), "big.png")
    assert c.post("/api/v1/auth/profile/image", headers=h,
                  data={"kind": "avatar", "file": huge},
                  content_type="multipart/form-data").status_code == 413
    assert c.post("/api/v1/auth/profile/image", headers=h,
                  data={"kind": "banner", "file": (io.BytesIO(b"\x89PNG\r\n\x1a\n"), "a.png")},
                  content_type="multipart/form-data").status_code == 422
    assert c.post("/api/v1/auth/profile/image").status_code == 401

    # ---- certificates ----
    assert c.get("/api/v1/certificates", headers=h).get_json()["certificates"] == []

    # half the course earns nothing
    c.post("/api/v1/progress", headers=h, json={"lesson_id": a_id, "completed": True})
    assert c.get("/api/v1/certificates", headers=h).get_json()["certificates"] == []

    # finishing it does
    r = c.post("/api/v1/progress", headers=h, json={"lesson_id": b_id, "completed": True})
    assert r.get_json()["certificate"], r.get_json()
    serial = r.get_json()["certificate"]["serial"]
    mine = c.get("/api/v1/certificates", headers=h).get_json()["certificates"]
    assert len(mine) == 1 and mine[0]["serial"] == serial, mine

    # re-completing does not mint a second one
    c.post("/api/v1/progress", headers=h, json={"lesson_id": b_id, "completed": True})
    assert len(c.get("/api/v1/certificates", headers=h).get_json()["certificates"]) == 1

    # a course without has_certificate never issues one
    c.post("/api/v1/progress", headers=h, json={"lesson_id": c_id, "completed": True})
    assert len(c.get("/api/v1/certificates", headers=h).get_json()["certificates"]) == 1

    # public verification works without a token and leaks no account details
    r = c.get(f"/api/v1/certificates/{serial}")
    assert r.status_code == 200 and r.get_json()["valid"] is True, r.get_json()
    body = r.get_json()["certificate"]
    assert body["learner_name"] == "د. محمد" and "email" not in body and "user_id" not in body, body
    assert c.get("/api/v1/certificates/BT-NOPE").status_code == 404

    # ---- derived activity ----
    feed = c.get("/api/v1/activity", headers=h).get_json()["activity"]
    kinds = {item["type"] for item in feed}
    assert "lesson_completed" in kinds and "certificate" in kinds, feed
    stamps = [item["at"] for item in feed]
    assert stamps == sorted(stamps, reverse=True), stamps
    assert c.get("/api/v1/activity").status_code == 401

    print("profile self-check OK")


if __name__ == "__main__":
    demo()
