"""Instructor portal self-check: isolation (foreign -> 404) + video permission gating.

Run: python -m tests.test_instructor  (needs DATABASE_URL)
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import User
from app.security import hash_password


def _mk(c, app, tag, role):
    email = f"{role}_{tag}@t.test"
    with app.app_context():
        db.session.add(User(name=role, email=email, password_hash=hash_password("secret12"), role=role))
        db.session.commit()
    tok = c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).get_json()["access_token"]
    with app.app_context():
        uid = User.query.filter_by(email=email).first().id
    return {"Authorization": f"Bearer {tok}"}, uid


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
    c = app.test_client()
    A, aid = _mk(c, app, tag, "instructor")
    B, bid = _mk(c, app, tag + "b", "instructor")
    admin, _ = _mk(c, app, tag, "admin")
    student, _ = _mk(c, app, tag, "student")

    # student blocked from instructor area
    assert c.get("/api/v1/instructor/stats", headers=student).status_code == 403

    # A creates a course (instructor_id forced to A)
    course = c.post("/api/v1/instructor/courses", headers=A, json={"title": "دورة A", "status": "published"}).get_json()["course"]
    cid = course["id"]
    assert course["instructor"]["id"] == aid

    # isolation: B cannot see/edit/delete A's course -> 404 (not 403)
    assert c.get(f"/api/v1/instructor/courses/{cid}", headers=B).status_code == 404
    assert c.patch(f"/api/v1/instructor/courses/{cid}", headers=B, json={"title": "hack"}).status_code == 404
    assert c.delete(f"/api/v1/instructor/courses/{cid}", headers=B).status_code == 404
    assert c.post(f"/api/v1/instructor/courses/{cid}/modules", headers=B, json={"title": "x"}).status_code == 404
    # A can
    assert c.get(f"/api/v1/instructor/courses/{cid}", headers=A).status_code == 200
    mod = c.post(f"/api/v1/instructor/courses/{cid}/modules", headers=A, json={"title": "M"}).get_json()["module"]
    lesson = c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=A, json={"title": "L"}).get_json()["lesson"]

    # B cannot add a lesson to A's module
    assert c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=B, json={"title": "x"}).status_code == 404

    # video add allowed by default (can_add_video=true)
    assert c.patch(f"/api/v1/instructor/lessons/{lesson['id']}", headers=A,
                   json={"vdocipher_video_id": "VID1"}).status_code == 200
    # editing an existing video needs can_edit_video (default false) -> 403
    assert c.patch(f"/api/v1/instructor/lessons/{lesson['id']}", headers=A,
                   json={"vdocipher_video_id": "VID2"}).status_code == 403

    # admin revokes can_add_video -> new video add now forbidden
    c.patch(f"/api/v1/admin/users/{aid}", headers=admin, json={"can_add_video": False})
    l2 = c.post(f"/api/v1/instructor/modules/{mod['id']}/lessons", headers=A, json={"title": "L2"}).get_json()["lesson"]
    assert c.patch(f"/api/v1/instructor/lessons/{l2['id']}", headers=A,
                   json={"vdocipher_video_id": "VID3"}).status_code == 403

    # stats scoped to A
    st = c.get("/api/v1/instructor/stats", headers=A).get_json()
    assert st["courses"] == 1 and st["published"] == 1
    # B's stats see none of A's
    assert c.get("/api/v1/instructor/stats", headers=B).get_json()["courses"] == 0

    print("instructor portal self-check OK")


if __name__ == "__main__":
    demo()
