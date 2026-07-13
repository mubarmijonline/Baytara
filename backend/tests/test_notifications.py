"""Notifications self-check: payment-approve emits, student reads/marks, admin broadcast.

Run: python -m tests.test_notifications  (needs DATABASE_URL)
"""
import io
import uuid
import tempfile

import app.api.v1.payment as paymod
from app import create_app
from app.extensions import db
from app.models import Category, Course, CourseModule, Lesson, User, InstapayAccount
from app.security import hash_password

RECEIPT = "Transaction Successful\n✓\n100 EGP\nTotal Amount 100 EGP\nReference\n{ref}\nFrom\nX\nx@instapay\nTo\n**h\nogs@instapay\n"


def _tok(c, email, role=None, app=None):
    c.post("/api/v1/auth/register", json={"name": "U", "email": email, "password": "secret12"})
    if role:
        with app.app_context():
            u = User.query.filter_by(email=email).first(); u.role = role; db.session.commit()
    return {"Authorization": f"Bearer {c.post('/api/v1/auth/login', json={'email': email, 'password': 'secret12'}).get_json()['access_token']}"}


def demo():
    app = create_app()
    app.config["INSTAPAY_IMAGE_DIR"] = tempfile.mkdtemp()
    tag = uuid.uuid4().hex[:8]
    ref = "7" + uuid.uuid4().int.__str__()[:13]
    paymod.extract_text = lambda p: RECEIPT.format(ref=ref)

    with app.app_context():
        db.create_all()
        db.session.add(InstapayAccount(account_name="OGS", number="011", url="https://x/ogs/instapay", active=True))
        instr = User(name="i", email=f"ni_{tag}@t.test", password_hash=hash_password("secret12"), role="instructor")
        db.session.add(instr); db.session.flush()
        cat = Category(name=f"C{tag}", slug=f"c-{tag}"); db.session.add(cat); db.session.flush()
        course = Course(title="دورة الإشعارات", slug=f"k-{tag}", price=100, instructor_id=instr.id,
                        category_id=cat.id, status="published")
        db.session.add(course); db.session.commit()
        cid = course.id

    c = app.test_client()
    sh = _tok(c, f"ns_{tag}@t.test")
    ah = _tok(c, f"na_{tag}@t.test", role="admin", app=app)

    # student submits a receipt (paid course), admin approves -> notification emitted
    c.post("/api/v1/payment/instapay", data={"course_id": cid, "image": (io.BytesIO(b"x"), "r.png", "image/png")},
           content_type="multipart/form-data", headers=sh)
    pid = c.get("/api/v1/admin/payments?status=pending", headers=ah).get_json()["payments"][0]["id"]

    assert c.get("/api/v1/notifications", headers=sh).get_json()["unread"] == 0
    c.post(f"/api/v1/admin/payments/{pid}/approve", headers=ah)
    n = c.get("/api/v1/notifications", headers=sh).get_json()
    assert n["unread"] == 1 and n["notifications"][0]["type"] == "payment_approved", n

    # mark one read -> unread drops
    nid = n["notifications"][0]["id"]
    c.post(f"/api/v1/notifications/{nid}/read", headers=sh)
    assert c.get("/api/v1/notifications/unread-count", headers=sh).get_json()["unread"] == 0

    # admin broadcast to students reaches this student
    sent = c.post("/api/v1/admin/notifications", headers=ah, json={"title": "إعلان", "body": "مرحبا", "role": "student"})
    assert sent.status_code == 200 and sent.get_json()["sent"] >= 1
    assert c.get("/api/v1/notifications/unread-count", headers=sh).get_json()["unread"] == 1

    # read-all clears
    c.post("/api/v1/notifications/read-all", headers=sh)
    assert c.get("/api/v1/notifications/unread-count", headers=sh).get_json()["unread"] == 0

    # cannot read another user's notification
    assert c.post("/api/v1/notifications/999999/read", headers=sh).status_code == 404

    print("notifications self-check OK")


if __name__ == "__main__":
    demo()
