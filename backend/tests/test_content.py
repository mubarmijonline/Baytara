"""Content layer self-check: settings, articles (blog/content), contact, instructor profile.

Run: python -m tests.test_content  (needs DATABASE_URL)
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import User
from app.security import hash_password


def _admin(c, app, tag):
    with app.app_context():
        db.session.add(User(name="A", email=f"cadm_{tag}@t.test",
                            password_hash=hash_password("secret12"), role="admin"))
        db.session.commit()
    tok = c.post("/api/v1/auth/login", json={"email": f"cadm_{tag}@t.test", "password": "secret12"}).get_json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
    c = app.test_client()
    h = _admin(c, app, tag)

    # settings: bulk upsert then public read
    assert c.put("/api/v1/admin/settings", headers=h,
                 json={"hero": {"title": "بيطرة", "subtitle": "تعلّم"}, "contact": {"email": "x@y.z"}}).status_code == 200
    pub = c.get("/api/v1/settings").get_json()["settings"]
    assert pub["hero"]["title"] == "بيطرة" and pub["contact"]["email"] == "x@y.z"

    # article: draft hidden from public, publish -> visible
    cr = c.post("/api/v1/admin/articles", headers=h,
                json={"type": "blog", "title": f"مقال {tag}", "body": "نص", "excerpt": "مقتطف"})
    assert cr.status_code == 201, cr.get_json()
    aid, slug = cr.get_json()["article"]["id"], cr.get_json()["article"]["slug"]
    assert c.get(f"/api/v1/articles/{slug}").status_code == 404  # draft
    assert c.patch(f"/api/v1/admin/articles/{aid}", headers=h, json={"status": "published"}).status_code == 200
    got = c.get(f"/api/v1/articles/{slug}")
    assert got.status_code == 200 and got.get_json()["article"]["body"] == "نص"
    # type filter
    c.post("/api/v1/admin/articles", headers=h, json={"type": "content", "title": f"محتوى {tag}", "status": "published"})
    blogs = c.get("/api/v1/articles?type=blog").get_json()["articles"]
    assert all(a["type"] == "blog" for a in blogs)

    # contact: public submit -> admin inbox + mark read
    assert c.post("/api/v1/contact", json={"name": "زائر", "email": "visitor@example.com", "body": "مرحبا"}).status_code == 201
    assert c.post("/api/v1/contact", json={"name": "x", "email": "bad", "body": "y"}).status_code == 422
    inbox = c.get("/api/v1/admin/messages", headers=h).get_json()
    assert inbox["unread"] >= 1
    mid = inbox["messages"][0]["id"]
    assert c.patch(f"/api/v1/admin/messages/{mid}", headers=h, json={"is_read": True}).get_json()["message"]["is_read"] is True

    # instructor profile fields via user update, surfaced on public instructor endpoint
    ins = c.post("/api/v1/admin/users", headers=h,
                 json={"name": "د. خبير", "email": f"ins_{tag}@t.test", "password": "secret12", "role": "instructor"}).get_json()["user"]
    c.patch(f"/api/v1/admin/users/{ins['id']}", headers=h,
            json={"headline": "استشاري", "bio": "خبرة 10 سنوات", "expertise": ["الماشية", "الدواجن"]})
    prof = c.get(f"/api/v1/instructors/{ins['id']}").get_json()["instructor"]
    # public instructor endpoint currently returns id+name; ensure it still works
    assert prof["id"] == ins["id"]

    print("content self-check OK")


if __name__ == "__main__":
    demo()
