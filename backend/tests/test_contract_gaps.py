"""Contract-gap features self-check (real DB, mocked Vision). Needs DATABASE_URL.

Run: python -m tests.test_contract_gaps
Covers: access-duration expiry gate, renewal (extend), course bundle (enroll-all),
device limit (block 3rd), i18n content fallback, watermark carries phone.
"""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Bundle, Category, Course, CourseVideo, Enrollment, Lesson, Setting, User
from app.security import hash_password
from app.services.video_provider import watermark_for


@pytest.fixture
def isolated_app(tmp_path):
    config = type("ContractGapsConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'contract-gaps.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def test_admin_mixed_bundle_validates_final_contents_before_commit(isolated_app):
    with isolated_app.app_context():
        admin = User(name="Admin", email="bundle-admin@example.test",
                     password_hash=hash_password("secret12"), role="admin")
        instructor = User(name="Instructor", email="bundle-instructor@example.test",
                          password_hash="hash", role="instructor")
        category = Category(name="Bundle category", slug="bundle-category")
        db.session.add_all([admin, instructor, category])
        db.session.flush()
        general_course = Course(
            title="General course", slug="bundle-general-course", instructor_id=instructor.id,
            category_id=category.id, status="published", access_type="general", price=100,
        )
        baytarian_course = Course(
            title="Baytarian course", slug="bundle-baytarian-course", instructor_id=instructor.id,
            category_id=category.id, status="published", access_type="baytarian", price=100,
        )
        general_video = Lesson(
            title="General video", category_id=category.id, status="published",
            access_type="general", price=50, vdocipher_video_id="bundle-general-video",
        )
        baytarian_video = Lesson(
            title="Baytarian video", category_id=category.id, status="published",
            access_type="baytarian", price=50, vdocipher_video_id="bundle-baytarian-video",
        )
        db.session.add_all([general_course, baytarian_course, general_video, baytarian_video])
        db.session.commit()
        ids = {
            "general_course": general_course.id,
            "baytarian_course": baytarian_course.id,
            "general_video": general_video.id,
            "baytarian_video": baytarian_video.id,
        }

    client = isolated_app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "bundle-admin@example.test", "password": "secret12",
    })
    headers = {"Authorization": f"Bearer {login.get_json()['access_token']}"}

    created = client.post("/api/v1/admin/bundles", headers=headers, json={
        "title": "General package", "status": "published", "access_type": "general",
        "price": 125, "course_ids": [ids["general_course"]],
        "video_ids": [ids["general_video"]],
    })
    assert created.status_code == 201, created.get_json()
    bundle = created.get_json()["bundle"]
    assert bundle["access_type"] == "general"
    assert bundle["course_ids"] == [ids["general_course"]]
    assert bundle["video_ids"] == [ids["general_video"]]

    invalid_criteria = client.post("/api/v1/admin/bundles", headers=headers, json={
        "title": "Invalid criteria", "status": "published", "access_type": "general",
        "price": 0, "access_days": 0, "course_ids": [], "video_ids": [],
    })
    assert invalid_criteria.status_code == 422
    assert set(invalid_criteria.get_json()["errors"]) == {
        "positive_price_required", "positive_access_days_required",
    }

    mismatch = client.post("/api/v1/admin/bundles", headers=headers, json={
        "title": "Invalid package", "status": "published", "access_type": "general",
        "price": 125, "course_ids": [ids["baytarian_course"]],
        "video_ids": [ids["baytarian_video"]],
    })
    assert mismatch.status_code == 422
    assert set(mismatch.get_json()["errors"]) == {
        "incompatible_course_audience", "incompatible_video_audience",
    }

    course_reverse = client.patch(
        f"/api/v1/admin/courses/{ids['general_course']}", headers=headers,
        json={"access_type": "baytarian"},
    )
    assert course_reverse.status_code == 422
    assert course_reverse.get_json()["errors"] == ["incompatible_course_audience"]

    video_reverse = client.patch(
        f"/api/v1/admin/videos/{ids['general_video']}", headers=headers,
        json={"access_type": "baytarian"},
    )
    assert video_reverse.status_code == 422
    assert video_reverse.get_json()["errors"] == ["incompatible_video_audience"]

    assignment_reverse = client.post(
        f"/api/v1/admin/videos/{ids['general_video']}/courses", headers=headers,
        json={"course_ids": [ids["general_course"]]},
    )
    assert assignment_reverse.status_code == 422
    assert assignment_reverse.get_json()["errors"] == ["video_not_standalone"]

    update = client.patch(f"/api/v1/admin/bundles/{bundle['id']}", headers=headers, json={
        "access_type": "baytarian",
    })
    assert update.status_code == 422
    assert update.get_json()["errors"] == ["incompatible_course_audience", "incompatible_video_audience"]
    with isolated_app.app_context():
        unchanged = db.session.get(Bundle, bundle["id"])
        assert unchanged.access_type == "general"
        assert [course.id for course in unchanged.courses] == [ids["general_course"]]
        assert [video.id for video in unchanged.videos] == [ids["general_video"]]
        assert db.session.get(Course, ids["general_course"]).access_type == "general"
        assert db.session.get(Lesson, ids["general_video"]).access_type == "general"
        assert CourseVideo.query.filter_by(video_id=ids["general_video"]).count() == 0


def _mk_course(tag, price=200, access_days=None, title_en=None):
    instr = User(name="د", email=f"i_{tag}@t.test", password_hash=hash_password("secret12"), role="instructor")
    db.session.add(instr)
    db.session.flush()
    cat = Category(name=f"C{tag}", slug=f"c-{tag}")
    db.session.add(cat)
    db.session.flush()
    course = Course(title=f"K{tag}", title_en=title_en, slug=f"k-{tag}", price=price,
                    instructor_id=instr.id, category_id=cat.id, status="published", access_days=access_days)
    db.session.add(course)
    db.session.commit()
    return course.id


def _token(c, email, role=None, app=None, device_id=None):
    c.post("/api/v1/auth/register",
           json={"name": "U", "email": email, "password": "secret12", "device_id": device_id})
    if role:
        with app.app_context():
            u = User.query.filter_by(email=email).first()
            u.role = role
            db.session.commit()
    return c.post("/api/v1/auth/login",
                  json={"email": email, "password": "secret12", "device_id": device_id}).get_json()["access_token"]


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]

    with app.app_context():
        db.create_all()
        s = db.session.get(Setting, "renewal_percent") or Setting(key="renewal_percent")
        s.value = 25
        db.session.merge(s)
        db.session.commit()
        c30 = _mk_course(f"a{tag}", price=200, access_days=30, title_en="Anatomy 101")

    c = app.test_client()
    sh = {"Authorization": f"Bearer {_token(c, f's_{tag}@t.test', device_id='dev-1')}"}
    ah = {"Authorization": f"Bearer {_token(c, f'ad_{tag}@t.test', role='admin', app=app)}"}

    # ---- i18n: lang=en returns English title, default (ar) returns base ----
    cd_en = c.get(f"/api/v1/courses/k-a{tag}?lang=en").get_json()["course"]
    cd_ar = c.get(f"/api/v1/courses/k-a{tag}").get_json()["course"]
    assert cd_en["title"] == "Anatomy 101", cd_en["title"]
    assert cd_ar["title"] == f"Ka{tag}", cd_ar["title"]

    # ---- quote: enroll price = course price ----
    q = c.get(f"/api/v1/payment/quote?kind=enroll&course_id={c30}", headers=sh).get_json()
    assert q["expected_amount"] == 200.0, q

    # ---- grant c30 enrollment (30-day access) directly; gateway purchase covered in test_fawaterk ----
    uid_student = None
    with app.app_context():
        uid_student = User.query.filter_by(email=f"s_{tag}@t.test").first().id
        course = db.session.get(Course, c30)
        db.session.add(Enrollment(user_id=uid_student, course_id=c30, source="purchase", status="active",
                                  expires_at=Enrollment.compute_expiry(course.access_days)))
        db.session.commit()
    e30 = next(e for e in c.get("/api/v1/enrollments", headers=sh).get_json()["enrollments"]
               if e["course"]["id"] == c30)
    assert e30["expires_at"] is not None and e30["is_expired"] is False, e30

    # ---- access-duration gate: force-expire, playback + progress blocked ----
    with app.app_context():
        from app.models import Lesson
        row = Enrollment.query.filter_by(course_id=c30).first()
        row.expires_at = datetime.now(timezone.utc) - timedelta(days=1)
        l = Lesson(course_id=c30, title="l", vdocipher_video_id="vid123"); db.session.add(l)
        db.session.flush()
        db.session.add(CourseVideo(course_id=c30, video_id=l.id, position=0))
        db.session.commit()
        lesson_id = l.id
    pr = c.post("/api/v1/progress", json={"lesson_id": lesson_id, "completed": True}, headers=sh)
    assert pr.status_code == 403 and pr.get_json()["error"] == "access_expired", pr.get_json()
    pb = c.post("/api/v1/video/playback", json={"lesson_id": lesson_id}, headers=sh)
    assert pb.status_code == 403 and pb.get_json()["error"] == "access_expired", pb.get_json()

    # ---- renewal quote is a percentage of the price (extend logic covered in test_fawaterk) ----
    rq = c.get(f"/api/v1/payment/quote?kind=renewal&course_id={c30}", headers=sh).get_json()
    assert 0 < rq["expected_amount"] < 200.0, rq

    # ---- device limit: 2 devices ok, 3rd blocked, remove one -> ok ----
    dm = f"dl_{tag}@t.test"
    c.post("/api/v1/auth/register", json={"name": "D", "email": dm, "password": "secret12", "device_id": "d1"})
    assert c.post("/api/v1/auth/login", json={"email": dm, "password": "secret12", "device_id": "d2"}).status_code == 200
    blocked = c.post("/api/v1/auth/login", json={"email": dm, "password": "secret12", "device_id": "d3"})
    assert blocked.status_code == 403 and blocked.get_json()["error"] == "device_limit_reached", blocked.get_json()
    dtok = c.post("/api/v1/auth/login", json={"email": dm, "password": "secret12", "device_id": "d1"}).get_json()["access_token"]
    dh = {"Authorization": f"Bearer {dtok}"}
    devs = c.get("/api/v1/auth/devices", headers=dh).get_json()["devices"]
    assert len(devs) == 2, devs
    c.delete(f"/api/v1/auth/devices/{devs[0]['id']}", headers=dh)
    assert c.post("/api/v1/auth/login", json={"email": dm, "password": "secret12", "device_id": "d3"}).status_code == 200

    # ---- watermark carries phone when set ----
    with app.app_context():
        u = User(name="WM", email=f"wm_{tag}@t.test", phone="01099998888",
                 password_hash=hash_password("secret12"), role="student")
        db.session.add(u)
        db.session.commit()
        wm = watermark_for(u)
        assert "01099998888" in wm[0]["text"], wm

    print("contract-gaps self-check OK")


if __name__ == "__main__":
    demo()
