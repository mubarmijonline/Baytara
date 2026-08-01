"""Access tiers + Baytarian verification self-check (real DB). Needs DATABASE_URL.

Run: python -m tests.test_access_baytarian
Covers: audience visibility, Baytarian/general purchase gates, free enrollment,
and Baytarian verification.
"""
import io
import uuid

from app import create_app
from app.extensions import db
from app.models import Category, Course, User
from app.security import hash_password


def _mk(tag, access_type, price=0):
    instr = User(name="د", email=f"i_{tag}_{access_type}@t.test",
                 password_hash=hash_password("secret12"), role="instructor")
    db.session.add(instr); db.session.flush()
    cat = Category(name=f"C{tag}{access_type}", slug=f"c-{tag}-{access_type}")
    db.session.add(cat); db.session.flush()
    c = Course(title=f"K{tag}-{access_type}", slug=f"k-{tag}-{access_type}", price=price,
               instructor_id=instr.id, category_id=cat.id, status="published", access_type=access_type)
    db.session.add(c); db.session.commit()
    return c.id, c.slug


def _reg(c, email, role=None, app=None):
    c.post("/api/v1/auth/register", json={
        "name": "U", "email": email, "phone": "+201000000000", "password": "secret12",
    })
    if role:
        with app.app_context():
            u = User.query.filter_by(email=email).first(); u.role = role; db.session.commit()
    return c.post("/api/v1/auth/login", json={"email": email, "password": "secret12"}).get_json()["access_token"]


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        free_id, free_slug = _mk(tag, "free")
        vet_id, vet_slug = _mk(tag, "vet_free")
        bay_id, bay_slug = _mk(tag, "baytarian", price=300)
        gen_id, gen_slug = _mk(tag, "general", price=200)

    c = app.test_client()
    sh = {"Authorization": f"Bearer {_reg(c, f's_{tag}@t.test')}"}
    ih = {"Authorization": f"Bearer {_reg(c, f'i_{tag}@t.test', role='instructor', app=app)}"}
    ah = {"Authorization": f"Bearer {_reg(c, f'ad_{tag}@t.test', role='admin', app=app)}"}

    # ---- listing visibility: vet_free is only listed to verified Baytarians ----
    anon_slugs = {x["slug"] for x in c.get("/api/v1/courses?per_page=50").get_json()["courses"]}
    assert vet_slug not in anon_slugs and free_slug in anon_slugs and bay_slug in anon_slugs, anon_slugs
    stu_slugs = {x["slug"] for x in c.get("/api/v1/courses?per_page=50", headers=sh).get_json()["courses"]}
    assert vet_slug not in stu_slugs, "vet_free must be hidden from students"
    ins_slugs = {x["slug"] for x in c.get("/api/v1/courses?per_page=50", headers=ih).get_json()["courses"]}
    assert vet_slug not in ins_slugs, "unverified instructors do not bypass the audience policy"

    # ---- lock_reason annotation ----
    bay_pub = c.get(f"/api/v1/courses/{bay_slug}").get_json()["course"]
    assert bay_pub["lock_reason"] == "needs_baytarian" and bay_pub["access_type"] == "baytarian", bay_pub
    bay_for_student = c.get(f"/api/v1/courses/{bay_slug}", headers=sh).get_json()["course"]
    assert bay_for_student["lock_reason"] == "needs_baytarian"

    # ---- free enroll works; vet_free requires verified Baytarian status ----
    assert c.post("/api/v1/enrollments", json={"course_id": free_id}, headers=sh).status_code == 201
    r = c.post("/api/v1/enrollments", json={"course_id": vet_id}, headers=sh)
    assert r.status_code == 403 and r.get_json()["error"] == "needs_baytarian", r.get_json()
    r = c.post("/api/v1/enrollments", json={"course_id": vet_id}, headers=ih)
    assert r.status_code == 403 and r.get_json()["error"] == "needs_baytarian", r.get_json()

    # ---- general is purchasable by non-veterinarians; baytarian is not ----
    assert c.get(f"/api/v1/payment/quote?kind=enroll&course_id={gen_id}", headers=sh).status_code == 200
    q = c.get(f"/api/v1/payment/quote?kind=enroll&course_id={bay_id}", headers=sh)
    assert q.status_code == 403 and q.get_json()["error"] == "needs_baytarian", q.get_json()

    # ---- baytarian request: upload a pdf doc -> pending; duplicate -> 409 ----
    doc = (io.BytesIO(b"%PDF-1.4 fake license"), "license.pdf", "application/pdf")
    sub = c.post("/api/v1/baytarian/request", data={"documents": doc, "note": "clinic X"},
                 content_type="multipart/form-data", headers=sh)
    assert sub.status_code == 201, sub.get_json()
    rid = None
    dup = c.post("/api/v1/baytarian/request", data={"documents": (io.BytesIO(b"%PDF"), "d.pdf", "application/pdf")},
                 content_type="multipart/form-data", headers=sh)
    assert dup.status_code == 409 and dup.get_json()["error"] == "request_pending"
    me = c.get("/api/v1/baytarian/me", headers=sh).get_json()
    assert me["is_baytarian"] is False and me["request"]["status"] == "pending"

    # ---- admin sees request + doc, approves -> user becomes baytarian ----
    lst = c.get("/api/v1/admin/baytarian-requests?status=pending", headers=ah).get_json()
    row = next(r for r in lst["requests"] if r["user"]["email"] == f"s_{tag}@t.test")
    rid = row["id"]
    assert c.get(f"/api/v1/admin/baytarian-requests/{rid}/doc/0", headers=ah).status_code == 200
    assert c.get(f"/api/v1/admin/baytarian-requests/{rid}/doc/0", headers=sh).status_code == 403  # student can't
    ap = c.post(f"/api/v1/admin/baytarian-requests/{rid}/approve", headers=ah)
    assert ap.status_code == 200 and ap.get_json()["request"]["status"] == "approved"
    assert c.get("/api/v1/baytarian/me", headers=sh).get_json()["is_baytarian"] is True

    # ---- verified Baytarians can use Baytarian tiers, not general tiers ----
    assert c.get(f"/api/v1/payment/quote?kind=enroll&course_id={bay_id}", headers=sh).status_code == 200
    general = c.get(f"/api/v1/payment/quote?kind=enroll&course_id={gen_id}", headers=sh)
    assert general.status_code == 403 and general.get_json()["error"] == "non_veterinarians_only", general.get_json()
    assert c.get(f"/api/v1/courses/{bay_slug}", headers=sh).get_json()["course"]["lock_reason"] is None
    verified_slugs = {x["slug"] for x in c.get("/api/v1/courses?per_page=50", headers=sh).get_json()["courses"]}
    assert vet_slug in verified_slugs, "vet_free must be visible to verified Baytarians"
    assert c.post("/api/v1/enrollments", json={"course_id": vet_id}, headers=sh).status_code == 201

    print("access + baytarian self-check OK")


if __name__ == "__main__":
    demo()
