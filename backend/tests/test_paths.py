"""Learning paths self-check. Run: python -m tests.test_paths (needs DATABASE_URL).

Covers the admin CRUD (create, validation, reorder, delete) and the public read API
(drafts hidden, steps ordered, draft courses excluded from the counts).
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import Category, Course, Lesson, User
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

        # two published courses with real video minutes, plus one draft that must not count
        one = Course(title=f"Step one {tag}", slug=f"s1-{tag}", instructor_id=instr.id,
                     category_id=cat.id, status="published")
        two = Course(title=f"Step two {tag}", slug=f"s2-{tag}", instructor_id=instr.id,
                     category_id=cat.id, status="published")
        hidden = Course(title=f"Hidden {tag}", slug=f"s3-{tag}", instructor_id=instr.id,
                        category_id=cat.id, status="draft")
        db.session.add_all([one, two, hidden])
        db.session.flush()
        db.session.add_all([
            Lesson(course_id=one.id, title="L1", position=0, duration_minutes=30),
            Lesson(course_id=two.id, title="L2", position=0, duration_minutes=45),
            Lesson(course_id=hidden.id, title="L3", position=0, duration_minutes=90),
        ])
        db.session.commit()
        ids = [one.id, two.id, hidden.id]
    one_id, two_id, hidden_id = ids

    c = app.test_client()
    h = _admin_headers(c, app, tag)

    # a path needs a title
    assert c.post("/api/v1/admin/paths", headers=h, json={}).status_code == 422

    # bad level and bad status are rejected before anything is written
    for bad in ({"title": "x", "level": "expert"}, {"title": "x", "status": "live"}):
        r = c.post("/api/v1/admin/paths", headers=h, json=bad)
        assert r.status_code == 422, r.get_json()

    # unknown course id is rejected
    r = c.post("/api/v1/admin/paths", headers=h,
               json={"title": "x", "course_ids": [999_999_999]})
    assert r.status_code == 422 and "course_not_found" in r.get_json()["errors"], r.get_json()

    # create, draft by default
    r = c.post("/api/v1/admin/paths", headers=h, json={
        "title": f"مسار {tag}", "title_en": f"Path {tag}", "description": "d",
        "level": "intermediate", "course_ids": [one_id, two_id, hidden_id],
    })
    assert r.status_code == 201, r.get_json()
    path = r.get_json()["path"]
    pid, slug = path["id"], path["slug"]
    assert path["status"] == "draft" and path["level"] == "intermediate", path

    # the draft course is assigned but excluded from the public-facing figures
    assert path["courses_count"] == 2, path
    assert path["total_minutes"] == 75, path
    assert [s["slug"] for s in path["steps"]] == [f"s1-{tag}", f"s2-{tag}"], path
    assert path["start_slug"] == f"s1-{tag}", path

    # draft path is invisible publicly
    assert c.get(f"/api/v1/paths/{slug}").status_code == 404
    assert slug not in [p["slug"] for p in c.get("/api/v1/paths").get_json()["paths"]]

    # publish and reorder in one call
    r = c.patch(f"/api/v1/admin/paths/{pid}", headers=h,
                json={"status": "published", "course_ids": [two_id, one_id]})
    assert r.status_code == 200, r.get_json()
    assert [s["slug"] for s in r.get_json()["path"]["steps"]] == [f"s2-{tag}", f"s1-{tag}"]

    # public listing and detail now serve it, ordered, with English on ?lang=en
    listing = c.get("/api/v1/paths").get_json()["paths"]
    assert slug in [p["slug"] for p in listing], listing
    det = c.get(f"/api/v1/paths/{slug}").get_json()["path"]
    assert [s["position"] for s in det["steps"]] == [0, 1], det
    assert [x["slug"] for x in det["courses"]] == [f"s2-{tag}", f"s1-{tag}"], det
    assert c.get(f"/api/v1/paths/{slug}?lang=en").get_json()["path"]["title"] == f"Path {tag}"

    # omitting course_ids leaves the steps alone
    r = c.patch(f"/api/v1/admin/paths/{pid}", headers=h, json={"sort_order": 3})
    assert r.get_json()["path"]["courses_count"] == 2, r.get_json()

    # delete removes it from the public listing
    assert c.delete(f"/api/v1/admin/paths/{pid}", headers=h).status_code == 200
    assert c.get(f"/api/v1/paths/{slug}").status_code == 404
    assert c.delete(f"/api/v1/admin/paths/{pid}", headers=h).status_code == 404

    print("learning paths self-check OK")


if __name__ == "__main__":
    demo()
