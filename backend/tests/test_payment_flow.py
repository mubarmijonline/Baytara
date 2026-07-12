"""InstaPay payment flow self-check (mocked Vision, real DB). Needs DATABASE_URL.

Run: python -m tests.test_payment_flow
submit -> pending, reference dedup -> 409, admin-only approve, approve -> atomic enroll,
reject -> no enroll.
"""
import io
import uuid
import tempfile

import app.api.v1.payment as paymod
from app import create_app
from app.extensions import db
from app.models import Category, Course, InstapayAccount, User
from app.security import hash_password

RECEIPT = """Transaction Successful
✓
1,000.00 EGP
Total Amount 1,010.00 EGP
Fees 10 EGP
12 Mar 2026 08:45 PM
Reference
{ref}
From
Ahmed Diab
ahmed.diab@instapay
To
**** hash
ogs.center@instapay
"""


def _img():
    return (io.BytesIO(b"\x89PNG fake receipt bytes"), "receipt.png", "image/png")


def _mk_course(tag, price=199):
    instr = User(name="د", email=f"i_{tag}@t.test", password_hash=hash_password("secret12"), role="instructor")
    db.session.add(instr)
    db.session.flush()
    cat = Category(name=f"C{tag}", slug=f"c-{tag}")
    db.session.add(cat)
    db.session.flush()
    course = Course(title=f"K{tag}", slug=f"k-{tag}", price=price, instructor_id=instr.id,
                    category_id=cat.id, status="published")
    db.session.add(course)
    db.session.commit()
    return course.id


def _token(c, email, role=None, app=None):
    c.post("/api/v1/auth/register", json={"name": "U", "email": email, "password": "secret12"})
    if role:
        with app.app_context():
            u = User.query.filter_by(email=email).first()
            u.role = role
            db.session.commit()
    return c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).get_json()["access_token"]


def demo():
    app = create_app()
    app.config["INSTAPAY_IMAGE_DIR"] = tempfile.mkdtemp()
    tag = uuid.uuid4().hex[:8]
    ref = "9" + uuid.uuid4().int.__str__()[:13]
    paymod.extract_text = lambda path: RECEIPT.format(ref=ref)  # mock Vision

    with app.app_context():
        db.create_all()
        db.session.add(InstapayAccount(account_name="OGS", number="01012345678",
                                       url="https://ipn.eg/ogs.center/instapay", active=True))
        db.session.commit()
        course_id = _mk_course(f"a{tag}")
        course2_id = _mk_course(f"b{tag}")

    c = app.test_client()
    sh = {"Authorization": f"Bearer {_token(c, f's_{tag}@t.test')}"}
    ah = {"Authorization": f"Bearer {_token(c, f'ad_{tag}@t.test', role='admin', app=app)}"}

    # submit receipt -> pending, parsed reference + navy-account validated
    r = c.post("/api/v1/payment/instapay", data={"course_id": course_id, "image": _img()},
               content_type="multipart/form-data", headers=sh)
    assert r.status_code == 201, r.get_json()
    body = r.get_json()["payment"]
    assert body["status"] == "pending" and body["reference"] == ref
    assert body["ogs_account_found"] == "Exist" and body["is_total_amount_correct"] is True
    pid = body["id"]

    # duplicate reference rejected
    dup = c.post("/api/v1/payment/instapay", data={"course_id": course_id, "image": _img()},
                 content_type="multipart/form-data", headers=sh)
    assert dup.status_code == 409, dup.get_json()

    # non-image rejected
    bad = c.post("/api/v1/payment/instapay",
                 data={"course_id": course2_id, "image": (io.BytesIO(b"x"), "x.txt", "text/plain")},
                 content_type="multipart/form-data", headers=sh)
    assert bad.status_code == 415

    # admin-only gates
    assert c.get("/api/v1/admin/payments", headers=sh).status_code == 403
    assert c.post(f"/api/v1/admin/payments/{pid}/approve", headers=sh).status_code == 403

    # NOT enrolled before approval
    assert c.get("/api/v1/enrollments", headers=sh).get_json()["enrollments"] == []

    # admin approves -> atomic enrollment
    ap = c.post(f"/api/v1/admin/payments/{pid}/approve", headers=ah)
    assert ap.status_code == 200 and ap.get_json()["payment"]["status"] == "approved"
    enr = c.get("/api/v1/enrollments", headers=sh).get_json()["enrollments"]
    assert [e["course"]["id"] for e in enr] == [course_id], enr

    # double-approve rejected
    assert c.post(f"/api/v1/admin/payments/{pid}/approve", headers=ah).status_code == 409

    # reject flow on a second submission (fresh ref)
    ref2 = "8" + uuid.uuid4().int.__str__()[:13]
    paymod.extract_text = lambda path: RECEIPT.format(ref=ref2)
    r2 = c.post("/api/v1/payment/instapay", data={"course_id": course2_id, "image": _img()},
                content_type="multipart/form-data", headers=sh)
    pid2 = r2.get_json()["payment"]["id"]
    rj = c.post(f"/api/v1/admin/payments/{pid2}/reject", json={"reason": "blurry"}, headers=ah)
    assert rj.status_code == 200 and rj.get_json()["payment"]["status"] == "rejected"
    assert course2_id not in [e["course"]["id"] for e in c.get("/api/v1/enrollments", headers=sh).get_json()["enrollments"]]

    print("instapay payment flow self-check OK")


if __name__ == "__main__":
    demo()
