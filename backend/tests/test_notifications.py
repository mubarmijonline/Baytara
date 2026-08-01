"""Notifications self-check: gateway paid-payment emits, student reads/marks, admin broadcast.

Run: python -m tests.test_notifications  (needs DATABASE_URL)
"""
import hmac
import uuid
import hashlib

import app.services.fawaterk as fw
import app.api.v1.payment as paymod
from app import create_app
from app.extensions import db
from app.models import Category, Course, Payment, Setting, User
from app.security import hash_password

VENDOR = "notif-vendor-key"


def _tok(c, email, role=None, app=None):
    c.post("/api/v1/auth/register", json={
        "name": "U", "email": email, "phone": "+201000000000", "password": "secret12",
    })
    if role:
        with app.app_context():
            u = User.query.filter_by(email=email).first(); u.role = role; db.session.commit()
    return {"Authorization": f"Bearer {c.post('/api/v1/auth/login', json={'email': email, 'password': 'secret12'}).get_json()['access_token']}"}


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    inv = [5000]

    def fake_link(amount, currency, customer, items, payload, redirect_urls):
        inv[0] += 1
        return {"url": f"https://staging.fawaterk.com/link/{inv[0]}", "invoice_id": str(inv[0]), "invoice_key": f"key{inv[0]}"}
    fw.create_invoice_link = fake_link
    paymod.fawaterk.create_invoice_link = fake_link

    with app.app_context():
        db.create_all()
        for k, v in (("secret_fawaterk_api", "x"), ("secret_fawaterk_vendor", VENDOR)):
            s = db.session.get(Setting, k) or Setting(key=k); s.value = v; db.session.merge(s)
        instr = User(name="i", email=f"ni_{tag}@t.test", password_hash=hash_password("secret12"), role="instructor")
        db.session.add(instr); db.session.flush()
        cat = Category(name=f"C{tag}", slug=f"c-{tag}"); db.session.add(cat); db.session.flush()
        course = Course(title="دورة الإشعارات", slug=f"k-{tag}", price=100, instructor_id=instr.id,
                        category_id=cat.id, status="published", access_type="general")
        db.session.add(course); db.session.commit()
        cid = course.id

    c = app.test_client()
    sh = _tok(c, f"ns_{tag}@t.test")
    ah = _tok(c, f"na_{tag}@t.test", role="admin", app=app)

    # student checkout (paid course) -> paid webhook emits a notification
    r = c.post("/api/v1/payment/checkout", json={"kind": "enroll", "course_id": cid}, headers=sh)
    pid = r.get_json()["payment_id"]
    assert c.get("/api/v1/notifications", headers=sh).get_json()["unread"] == 0
    with app.app_context():
        p = db.session.get(Payment, pid)
        msg = f"InvoiceId={p.invoice_id}&InvoiceKey={p.invoice_key}&PaymentMethod=Visa"
        h = hmac.new(VENDOR.encode(), msg.encode(), hashlib.sha256).hexdigest()
    c.post("/api/v1/payment/fawaterk/webhook", json={
        "hashKey": h, "invoice_id": p.invoice_id, "invoice_key": p.invoice_key,
        "payment_method": "Visa", "invoice_status": "paid", "pay_load": {"payment_id": pid}})

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
