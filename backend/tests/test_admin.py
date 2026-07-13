"""Admin CRUD self-check: stats, users, categories, courses, modules, lessons. Needs DATABASE_URL.

Run: python -m tests.test_admin
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import User
from app.security import hash_password


def _admin_headers(c, app, tag):
    with app.app_context():
        db.session.add(User(name="A", email=f"adm_{tag}@t.test",
                            password_hash=hash_password("secret12"), role="admin"))
        db.session.commit()
    tok = c.post("/api/v1/auth/login", json={"email": f"adm_{tag}@t.test", "password": "secret12"}).get_json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
    c = app.test_client()
    h = _admin_headers(c, app, tag)

    # non-admin blocked
    c.post("/api/v1/auth/register", json={"name": "S", "email": f"s_{tag}@t.test", "password": "secret12"})
    sh = {"Authorization": f"Bearer {c.post('/api/v1/auth/login', json={'email': f's_{tag}@t.test', 'password': 'secret12'}).get_json()['access_token']}"}
    assert c.get("/api/v1/admin/stats", headers=sh).status_code == 403

    # stats
    assert c.get("/api/v1/admin/stats", headers=h).status_code == 200

    # create instructor via users API
    r = c.post("/api/v1/admin/users", headers=h,
               json={"name": "د. م", "email": f"instr_{tag}@t.test", "password": "secret12", "role": "instructor"})
    assert r.status_code == 201, r.get_json()
    instr_id = r.get_json()["user"]["id"]
    assert c.post("/api/v1/admin/users", headers=h,
                  json={"name": "x", "email": f"instr_{tag}@t.test", "password": "secret12"}).status_code == 409  # dup

    # category
    cat = c.post("/api/v1/admin/categories", headers=h, json={"name": "الجراحة"}).get_json()["category"]
    assert cat["slug"]

    # course create -> publish -> appears in public listing
    cr = c.post("/api/v1/admin/courses", headers=h, json={
        "title": "دورة الاختبار", "description": "d", "price": 100,
        "instructor_id": instr_id, "category_id": cat["id"], "status": "draft"})
    assert cr.status_code == 201, cr.get_json()
    course_id = cr.get_json()["course"]["id"]
    slug = cr.get_json()["course"]["slug"]
    # draft not public yet
    assert c.get(f"/api/v1/courses/{slug}").status_code == 404
    # publish
    assert c.patch(f"/api/v1/admin/courses/{course_id}", headers=h, json={"status": "published"}).status_code == 200
    assert c.get(f"/api/v1/courses/{slug}").status_code == 200

    # bad instructor rejected
    assert c.post("/api/v1/admin/courses", headers=h,
                  json={"title": "x", "instructor_id": 999999}).status_code == 422

    # module + lesson
    m = c.post(f"/api/v1/admin/courses/{course_id}/modules", headers=h, json={"title": "الوحدة 1"}).get_json()["module"]
    l = c.post(f"/api/v1/admin/modules/{m['id']}/lessons", headers=h,
               json={"title": "الدرس 1", "duration_minutes": 12}).get_json()["lesson"]
    # full admin course tree shows them
    tree = c.get(f"/api/v1/admin/courses/{course_id}", headers=h).get_json()["course"]
    assert tree["modules"][0]["lessons"][0]["title"] == "الدرس 1"

    # regression: deleting a user WITH dependents (enrollment) must not 500
    victim = c.post("/api/v1/admin/users", headers=h,
                    json={"name": "v", "email": f"v_{tag}@t.test", "password": "secret12"}).get_json()["user"]
    with app.app_context():
        from app.models import Enrollment, Notification
        db.session.add(Enrollment(user_id=victim["id"], course_id=course_id, source="free", status="active"))
        db.session.add(Notification(user_id=victim["id"], type="info", title="x"))
        db.session.commit()
    assert c.delete(f"/api/v1/admin/users/{victim['id']}", headers=h).status_code == 200
    # an instructor owning courses cannot be deleted until courses are removed
    assert c.delete(f"/api/v1/admin/users/{instr_id}", headers=h).status_code == 409

    # lesson + module + course delete cascade
    assert c.delete(f"/api/v1/admin/lessons/{l['id']}", headers=h).status_code == 200
    assert c.delete(f"/api/v1/admin/courses/{course_id}", headers=h).status_code == 200
    assert c.get(f"/api/v1/admin/courses/{course_id}", headers=h).status_code == 404

    # category now unused -> deletable
    assert c.delete(f"/api/v1/admin/categories/{cat['id']}", headers=h).status_code == 200

    # self-guard: admin cannot delete self
    me = c.get("/api/v1/auth/me", headers=h).get_json()["user"]
    assert c.delete(f"/api/v1/admin/users/{me['id']}", headers=h).status_code == 409

    print("admin CRUD self-check OK")


if __name__ == "__main__":
    demo()
