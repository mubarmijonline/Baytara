"""Catalog read-API self-check. Run: python -m tests.test_catalog (needs DATABASE_URL).

Seeds a published + a draft course, then asserts listing hides drafts, filters
by category/search, detail returns modules/lessons, and instructor scoping works.
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import Category, Course, CourseModule, Lesson, User
from app.security import hash_password


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        instr = User(name="د. اختبار", email=f"i_{tag}@baytara.test", password_hash=hash_password("secret12"), role="instructor")
        db.session.add(instr)
        db.session.flush()
        cat = Category(name=f"Cat {tag}", slug=f"cat-{tag}")
        db.session.add(cat)
        db.session.flush()

        pub = Course(title=f"Published {tag}", slug=f"pub-{tag}", description="d", price=149,
                     instructor_id=instr.id, category_id=cat.id, status="published", duration_minutes=360)
        draft = Course(title=f"Draft {tag}", slug=f"draft-{tag}", instructor_id=instr.id,
                       category_id=cat.id, status="draft")
        db.session.add_all([pub, draft])
        db.session.flush()
        mod = CourseModule(course_id=pub.id, title="Module 1", position=0)
        db.session.add(mod)
        db.session.flush()
        db.session.add(Lesson(module_id=mod.id, title="Lesson 1", position=0, duration_minutes=20))
        db.session.commit()
        instr_id, cat_slug = instr.id, cat.slug

    c = app.test_client()

    # listing hides drafts, filters by category
    r = c.get(f"/api/v1/courses?category={cat_slug}")
    assert r.status_code == 200, r.get_json()
    slugs = [x["slug"] for x in r.get_json()["courses"]]
    assert f"pub-{tag}" in slugs and f"draft-{tag}" not in slugs, slugs

    # search filter
    assert c.get(f"/api/v1/courses?q=Published+{tag}").get_json()["total"] >= 1
    assert c.get(f"/api/v1/courses?q=zzz-{tag}").get_json()["total"] == 0

    # detail returns nested modules/lessons; draft 404s
    det = c.get(f"/api/v1/courses/pub-{tag}")
    assert det.status_code == 200
    body = det.get_json()["course"]
    assert body["modules"][0]["lessons"][0]["title"] == "Lesson 1"
    assert c.get(f"/api/v1/courses/draft-{tag}").status_code == 404

    # categories + instructor scoping (only published)
    assert any(x["slug"] == cat_slug for x in c.get("/api/v1/categories").get_json()["categories"])
    ins = c.get(f"/api/v1/instructors/{instr_id}").get_json()
    assert [x["slug"] for x in ins["courses"]] == [f"pub-{tag}"]

    print("catalog self-check OK")


if __name__ == "__main__":
    demo()
