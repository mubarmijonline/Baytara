"""Course detail payload self-check. Run: python -m tests.test_course_detail.

Asserts the new metadata fields, the module grouping used by the curriculum accordion,
and that the flat `videos` array the player reads is still there beside it.
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import Category, Course, CourseModule, CourseVideo, Lesson, User
from app.security import hash_password


def _admin_headers(c, app, tag):
    with app.app_context():
        db.session.add(User(name="A", email=f"adm_{tag}@t.test",
                            password_hash=hash_password("secret12"), role="admin"))
        db.session.commit()
    tok = c.post("/api/v1/auth/login",
                 json={"email": f"adm_{tag}@t.test", "password": "secret12"}).get_json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        instr = User(name="د. اختبار", email=f"i_{tag}@baytara.test",
                     password_hash=hash_password("secret12"), role="instructor")
        db.session.add(instr)
        db.session.flush()
        cat = Category(name=f"Cat {tag}", slug=f"cat-{tag}")
        db.session.add(cat)
        db.session.flush()

        course = Course(
            title=f"Course {tag}", slug=f"c-{tag}", instructor_id=instr.id, category_id=cat.id,
            status="published", access_type="free", level="intermediate", has_certificate=True,
            objectives=["هدف أول", "هدف ثانٍ"], objectives_en=["First goal", "Second goal"],
        )
        db.session.add(course)
        db.session.flush()

        # one video through CourseVideo (no module) and two inside a module
        loose = Lesson(title="Loose lesson", position=0, duration_minutes=10)
        db.session.add(loose)
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=loose.id, position=0))

        module = CourseModule(course_id=course.id, title="الوحدة الأولى", position=0)
        db.session.add(module)
        db.session.flush()
        db.session.add_all([
            Lesson(module=module, title="Module lesson 1", position=0, duration_minutes=20),
            Lesson(module=module, title="Module lesson 2", position=1, duration_minutes=30),
        ])
        db.session.commit()
        course_id, module_id, loose_id = course.id, module.id, loose.id

    c = app.test_client()
    body = c.get(f"/api/v1/courses/c-{tag}").get_json()["course"]

    # metadata
    assert body["level"] == "intermediate", body
    assert body["has_certificate"] is True, body
    assert body["objectives"] == ["هدف أول", "هدف ثانٍ"], body
    assert body["rating"] is None and body["reviews_count"] == 0, body   # unrated, never 0.0
    assert body["content_updated_at"], body

    # English objectives come back on ?lang=en, and fall back to Arabic when absent
    en = c.get(f"/api/v1/courses/c-{tag}?lang=en").get_json()["course"]
    assert en["objectives"] == ["First goal", "Second goal"], en

    # the flat list the player reads survives beside the grouped one
    assert [v["title"] for v in body["videos"]] == ["Loose lesson", "Module lesson 1", "Module lesson 2"], body
    assert body["lessons_count"] == 3 and body["video_minutes"] == 60, body

    # grouping: the module-less video leads in its own implicit unit
    modules = body["modules"]
    assert len(modules) == 2, modules
    assert modules[0]["id"] is None and modules[0]["title"] is None, modules
    assert modules[0]["lessons_count"] == 1 and modules[0]["total_minutes"] == 10, modules
    assert modules[1]["title"] == "الوحدة الأولى", modules
    assert modules[1]["lessons_count"] == 2 and modules[1]["total_minutes"] == 50, modules
    assert [v["title"] for v in modules[1]["videos"]] == ["Module lesson 1", "Module lesson 2"], modules

    # admin can author the metadata, and a bad level is refused
    h = _admin_headers(c, app, tag)
    assert c.patch(f"/api/v1/admin/courses/{course_id}", headers=h,
                   json={"level": "expert"}).status_code == 422
    r = c.patch(f"/api/v1/admin/courses/{course_id}", headers=h, json={
        "level": "advanced", "has_certificate": False,
        "objectives": ["  محفوظ  ", "", "   "],   # blanks dropped, values trimmed
    })
    assert r.status_code == 200, r.get_json()
    updated = r.get_json()["course"]
    assert updated["level"] == "advanced" and updated["has_certificate"] is False, updated
    assert updated["objectives"] == ["محفوظ"], updated

    # a unit is a property of the assignment, so the loose video can join the module
    # for this course without changing the video itself
    assert c.put(f"/api/v1/admin/courses/{course_id}/videos/{loose_id}/module", headers=h,
                 json={"module_id": 999_999}).status_code == 422
    assert c.put(f"/api/v1/admin/courses/{course_id}/videos/{loose_id}/module", headers=h,
                 json={"module_id": module_id}).status_code == 200
    modules = c.get(f"/api/v1/courses/c-{tag}").get_json()["course"]["modules"]
    assert len(modules) == 1 and modules[0]["lessons_count"] == 3, modules
    assert modules[0]["total_minutes"] == 60, modules

    print("course detail self-check OK")


if __name__ == "__main__":
    demo()
