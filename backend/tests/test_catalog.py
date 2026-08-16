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
                     instructor_id=instr.id, category_id=cat.id, status="published", duration_minutes=360,
                     level="beginner", rating_sum=15, rating_count=3)
        draft = Course(title=f"Draft {tag}", slug=f"draft-{tag}", instructor_id=instr.id,
                       category_id=cat.id, status="draft")
        # A second published course in the same category, so the level/access facets and
        # the sort order have something to separate.
        other = Course(title=f"Advanced {tag}", slug=f"adv-{tag}", description="d", price=0,
                       instructor_id=instr.id, category_id=cat.id, status="published",
                       duration_minutes=600, level="advanced", access_type="free",
                       enrolled_count=40, rating_sum=6, rating_count=3)
        db.session.add_all([pub, draft, other])
        db.session.flush()
        db.session.add(Lesson(course_id=pub.id, title="Lesson 1", position=0, duration_minutes=20))
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

    # level / access filters, and facets that exclude their own dimension so ticking
    # one level still reports the counts for the others.
    listing = c.get(f"/api/v1/courses?category={cat_slug}&level=beginner").get_json()
    assert [x["slug"] for x in listing["courses"]] == [f"pub-{tag}"], listing
    assert listing["facets"]["level"] == {"beginner": 1, "intermediate": 0, "advanced": 1, "breeders": 0}
    assert listing["facets"]["access_type"]["general"] == 1, listing["facets"]
    assert c.get(f"/api/v1/courses?category={cat_slug}&access_type=free").get_json()["total"] == 1

    # duration bands read the real content length: pub has a 20-minute lesson, so its
    # admin-typed 360 is ignored; adv has none, so its typed 600 stands.
    short = c.get(f"/api/v1/courses?category={cat_slug}&duration=short").get_json()
    assert [x["slug"] for x in short["courses"]] == [f"pub-{tag}"], short
    long_ = c.get(f"/api/v1/courses?category={cat_slug}&duration=long").get_json()
    assert [x["slug"] for x in long_["courses"]] == [f"adv-{tag}"], long_

    # rating filter and sort: pub averages 5.0, adv 2.0
    rated = c.get(f"/api/v1/courses?category={cat_slug}&min_rating=4.5").get_json()
    assert [x["slug"] for x in rated["courses"]] == [f"pub-{tag}"], rated
    popular = c.get(f"/api/v1/courses?category={cat_slug}&sort=popular").get_json()
    assert popular["courses"][0]["slug"] == f"adv-{tag}", popular
    by_rating = c.get(f"/api/v1/courses?category={cat_slug}&sort=rating").get_json()
    assert by_rating["courses"][0]["slug"] == f"pub-{tag}", by_rating

    # detail returns course videos (directly under course); draft 404s
    det = c.get(f"/api/v1/courses/pub-{tag}")
    assert det.status_code == 200
    body = det.get_json()["course"]
    assert body["videos"][0]["title"] == "Lesson 1", body
    assert c.get(f"/api/v1/courses/draft-{tag}").status_code == 404

    # categories + instructor scoping (only published)
    assert any(x["slug"] == cat_slug for x in c.get("/api/v1/categories").get_json()["categories"])
    ins = c.get(f"/api/v1/instructors/{instr_id}").get_json()
    assert sorted(x["slug"] for x in ins["courses"]) == sorted([f"pub-{tag}", f"adv-{tag}"]), ins

    print("catalog self-check OK")


if __name__ == "__main__":
    demo()
