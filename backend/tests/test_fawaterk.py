"""Fawaterak gateway self-check (real DB, mocked HTTP). Needs DATABASE_URL.

Run: python -m tests.test_fawaterk
Covers: checkout creates pending + returns url; HMAC webhook verify; paid -> atomic
enroll/renewal/bundle grant; idempotent re-delivery; bad signature rejected; baytarian
gate + not_purchasable at checkout.
"""
import hmac
import uuid
import hashlib

import app.services.fawaterk as fw
import app.api.v1.payment as paymod
from app import create_app
from app.extensions import db
from app.models import Bundle, Category, Course, Enrollment, Payment, Setting, User
from app.security import hash_password

VENDOR = "test-vendor-key-123"


def _mk_course(tag, access_type="general", price=200, access_days=None):
    u = uuid.uuid4().hex[:6]  # unique per course
    instr = User(name="د", email=f"i_{tag}_{u}@t.test", password_hash=hash_password("secret12"), role="instructor")
    db.session.add(instr); db.session.flush()
    cat = Category(name=f"C{tag}{u}", slug=f"c-{tag}-{u}")
    db.session.add(cat); db.session.flush()
    c = Course(title=f"K{tag}-{u}", slug=f"k-{tag}-{u}", price=price,
               instructor_id=instr.id, category_id=cat.id, status="published",
               access_type=access_type, access_days=access_days)
    db.session.add(c); db.session.commit()
    return c.id


def _tok(c, email, app):
    c.post("/api/v1/auth/register", json={"name": "U", "email": email, "password": "secret12"})
    return c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).get_json()["access_token"]


def _paid_hook(invoice_id, invoice_key, method, payment_id):
    msg = f"InvoiceId={invoice_id}&InvoiceKey={invoice_key}&PaymentMethod={method}"
    h = hmac.new(VENDOR.encode(), msg.encode(), hashlib.sha256).hexdigest()
    return {"hashKey": h, "invoice_id": invoice_id, "invoice_key": invoice_key,
            "payment_method": method, "invoice_status": "paid",
            "pay_load": {"payment_id": payment_id}, "referenceNumber": "REF" + str(invoice_id)}


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    inv = [1000]  # fake Fawaterak invoice id sequence

    # mock the outbound gateway call (no network)
    def fake_link(amount, currency, customer, items, payload, redirect_urls):
        inv[0] += 1
        return {"url": f"https://staging.fawaterk.com/link/{inv[0]}", "invoice_id": str(inv[0]), "invoice_key": f"key{inv[0]}"}
    fw.create_invoice_link = fake_link
    paymod.fawaterk.create_invoice_link = fake_link

    with app.app_context():
        db.create_all()
        for k, v in (("secret_fawaterk_api", "test-api"), ("secret_fawaterk_vendor", VENDOR)):
            s = db.session.get(Setting, k) or Setting(key=k)
            s.value = v; db.session.merge(s)
        db.session.commit()
        gen = _mk_course(tag, "general", price=200)
        ren = _mk_course(tag, "general", price=400, access_days=30)
        cb1 = _mk_course(tag, "general", price=150)
        cb2 = _mk_course(tag, "general", price=150)
        free = _mk_course(tag, "free", price=0)
        bay = _mk_course(tag, "baytarian", price=300)
        b = Bundle(title=f"Z{tag}", slug=f"z-{tag}", price=250, access_days=60, status="published")
        b.courses = [db.session.get(Course, cb1), db.session.get(Course, cb2)]
        db.session.add(b); db.session.commit()
        bundle_id = b.id

    c = app.test_client()
    sh = {"Authorization": f"Bearer {_tok(c, f's_{tag}@t.test', app)}"}
    hook = "/api/v1/payment/fawaterk/webhook"

    def checkout(kind, course_id=None, bundle_id=None):
        body = {"kind": kind}
        if course_id: body["course_id"] = course_id
        if bundle_id: body["bundle_id"] = bundle_id
        return c.post("/api/v1/payment/checkout", json=body, headers=sh)

    # ---- enroll checkout -> pending payment + redirect url ----
    r = checkout("enroll", course_id=gen)
    assert r.status_code == 201, r.get_json()
    body = r.get_json()
    assert body["url"].startswith("https://staging.fawaterk.com/link/"), body
    pid = body["payment_id"]
    with app.app_context():
        p = db.session.get(Payment, pid)
        assert p.status == "pending" and float(p.amount) == 200.0
        inv_id, inv_key = p.invoice_id, p.invoice_key

    # ---- bad signature rejected ----
    bad = dict(_paid_hook(inv_id, inv_key, "Visa", pid)); bad["hashKey"] = "deadbeef"
    assert c.post(hook, json=bad).status_code == 400

    # not enrolled yet
    assert c.get("/api/v1/enrollments", headers=sh).get_json()["enrollments"] == []

    # ---- valid paid webhook -> enrolled, payment paid ----
    ok = c.post(hook, json=_paid_hook(inv_id, inv_key, "Visa", pid))
    assert ok.status_code == 200, ok.get_json()
    enr = c.get("/api/v1/enrollments", headers=sh).get_json()["enrollments"]
    assert gen in [e["course"]["id"] for e in enr], enr
    with app.app_context():
        assert db.session.get(Payment, pid).status == "paid"

    # ---- idempotent: re-deliver same paid webhook, still one enrollment ----
    c.post(hook, json=_paid_hook(inv_id, inv_key, "Visa", pid))
    with app.app_context():
        assert Enrollment.query.filter_by(course_id=gen).count() == 1

    # ---- renewal: enroll first, expire, renew via gateway extends ----
    r2 = checkout("enroll", course_id=ren); p2 = r2.get_json()["payment_id"]
    with app.app_context():
        pp = db.session.get(Payment, p2)
        c.post(hook, json=_paid_hook(pp.invoice_id, pp.invoice_key, "Fawry", p2))
    from datetime import datetime, timedelta, timezone
    with app.app_context():
        e = Enrollment.query.filter_by(course_id=ren).first()
        e.expires_at = datetime.now(timezone.utc) - timedelta(days=2); db.session.commit()
    rn = checkout("renewal", course_id=ren); assert rn.status_code == 201, rn.get_json()
    p3 = rn.get_json()["payment_id"]
    with app.app_context():
        pp = db.session.get(Payment, p3)
        assert 0 < float(pp.amount) < 400.0  # renewal is a percentage of the price
    with app.app_context():
        pp = db.session.get(Payment, p3)
        c.post(hook, json=_paid_hook(pp.invoice_id, pp.invoice_key, "Visa", p3))
        e = Enrollment.query.filter_by(course_id=ren).first()
        assert not e.is_expired(), "renewal must extend into the future"

    # ---- bundle: paid enrolls all member courses ----
    rb = checkout("bundle", bundle_id=bundle_id); pb = rb.get_json()["payment_id"]
    with app.app_context():
        pp = db.session.get(Payment, pb)
        c.post(hook, json=_paid_hook(pp.invoice_id, pp.invoice_key, "Wallet", pb))
    got = {e["course"]["id"] for e in c.get("/api/v1/enrollments", headers=sh).get_json()["enrollments"]}
    assert {cb1, cb2} <= got, got

    # ---- free + baytarian gates at checkout ----
    assert checkout("enroll", course_id=free).status_code == 409  # not_purchasable
    bz = checkout("enroll", course_id=bay)
    assert bz.status_code == 403 and bz.get_json()["error"] == "needs_baytarian", bz.get_json()

    print("fawaterk self-check OK")


if __name__ == "__main__":
    demo()
