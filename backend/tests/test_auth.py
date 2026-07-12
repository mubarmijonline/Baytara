"""End-to-end auth self-check. Run: python -m tests.test_auth  (needs DATABASE_URL).

ponytail: one runnable check for the whole auth path (register->login->me->refresh->
duplicate/bad-password guards). No framework/fixtures until a real suite is asked for.
"""
import uuid

from app import create_app
from app.extensions import db


def demo():
    app = create_app()
    with app.app_context():
        db.create_all()
    c = app.test_client()
    email = f"t_{uuid.uuid4().hex[:8]}@baytara.test"

    r = c.post("/api/v1/auth/register", json={"name": "T", "email": email, "password": "secret12"})
    assert r.status_code == 201, r.get_json()
    access, refresh = r.get_json()["access_token"], r.get_json()["refresh_token"]

    # duplicate email rejected
    assert c.post("/api/v1/auth/register", json={"name": "T", "email": email, "password": "secret12"}).status_code == 409
    # short password rejected at trust boundary
    assert c.post("/api/v1/auth/register", json={"name": "T", "email": "x@y.z", "password": "short"}).status_code == 422

    # login: wrong password 401, right password ok
    assert c.post("/api/v1/auth/login", json={"email": email, "password": "nope"}).status_code == 401
    assert c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).status_code == 200

    # me requires auth
    assert c.get("/api/v1/auth/me").status_code == 401
    me = c.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {access}"})
    assert me.status_code == 200 and me.get_json()["user"]["email"] == email

    # refresh mints a new access token
    rf = c.post("/api/v1/auth/refresh", headers={"Authorization": f"Bearer {refresh}"})
    assert rf.status_code == 200 and rf.get_json()["access_token"]

    print("auth self-check OK")


if __name__ == "__main__":
    demo()
