"""The two document-judged routes into verification.

Anthropic is stubbed at `doc_judge.judge`, because the decision rules — which live in
`doc_judge.decide` and have their own offline self-check — are what these tests are
about. What is exercised here is everything around the verdict: who gets which status,
what reaches the admin queue, and what a revoke undoes.
"""
import io

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import BaytarianRequest, Notification, User
from app.security import hash_password

NATIONAL_ID = "27811291801536"


@pytest.fixture
def app(tmp_path):
    config = type("DocConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'doc.sqlite'}",
        "BAYTARIAN_DOC_DIR": str(tmp_path / "docs"),
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def _account(email="learner@example.test", role="student", national_id=None):
    user = User(name="محمد غريب محمد خضر", email=email, password_hash=hash_password("secret12"),
                role=role, national_id=national_id)
    db.session.add(user)
    db.session.commit()
    return user.id


def _client(app, email="learner@example.test"):
    client = app.test_client()
    token = client.post("/api/v1/auth/login",
                        json={"email": email, "password": "secret12"}).get_json()["access_token"]
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return client


def _verdict(**over):
    base = {"document_type": "veterinary college student ID", "issuer": "جامعة القاهرة",
            "holder_name": "محمد غريب محمد خضر", "national_id": "", "occupation": "",
            "occupation_is_veterinarian": False, "is_veterinary_student": False,
            "expired": False, "name_matches": True, "tampered": False,
            "confidence": "high", "reason": "بطاقة طالب سارية"}
    base.update(over)
    return base


def _stub_judge(monkeypatch, verdict):
    """Stub the one function that talks to Anthropic, so `decide` still runs for real."""
    from app.services import doc_judge

    monkeypatch.setattr(doc_judge, "judge", lambda images, expect: verdict)


def _upload(client, route="other", sides=("front",)):
    data = {"route": route}
    for side in sides:
        data[side] = (io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 40), f"{side}.png", "image/png")
    return client.post("/api/v1/baytarian/document", data=data,
                       content_type="multipart/form-data")


def test_student_card_grants_the_student_status_not_the_doctor_one(app, monkeypatch):
    uid = _account()
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True))
    response = _upload(_client(app))

    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body["is_vet_student"] is True
    assert body["is_baytarian"] is False          # the badge keeps meaning "licensed"
    user = db.session.get(User, uid)
    assert user.is_vet_student and not user.is_baytarian

    request_row = BaytarianRequest.query.filter_by(user_id=uid).one()
    assert (request_row.status, request_row.grant, request_row.route) == (
        "approved", "vet_student", "other")
    assert request_row.auto_approved and request_row.reviewed_by is None
    assert request_row.ai_verdict["document_type"] == "veterinary college student ID"


def test_a_student_reaches_free_vet_content_but_not_the_paid_tier(app):
    from app.services.catalog_access import audience_error

    student = User(name="s", email="s@example.test", password_hash="x", is_vet_student=True)
    outsider = User(name="o", email="o@example.test", password_hash="x")
    assert audience_error(student, "vet_free") is None
    assert audience_error(student, "baytarian") == "needs_baytarian"
    assert audience_error(outsider, "vet_free") == "needs_baytarian"
    # Not being a licensed vet, a student may still buy the general-audience content.
    assert audience_error(student, "general") is None


def test_a_national_id_reading_veterinarian_verifies_and_tells_the_admins(app, monkeypatch):
    uid = _account(national_id=NATIONAL_ID)
    admin_id = _account(email="admin@example.test", role="admin")
    _stub_judge(monkeypatch, _verdict(
        document_type="Egyptian national ID card", national_id=NATIONAL_ID,
        occupation="طبيب بيطري", occupation_is_veterinarian=True))

    response = _upload(_client(app), route="national_id", sides=("front", "back"))

    assert response.status_code == 201, response.get_json()
    assert db.session.get(User, uid).is_baytarian
    row = BaytarianRequest.query.filter_by(user_id=uid).one()
    assert (row.route, row.grant) == ("national_id", "baytarian")
    # Auto-approval is only defensible while a person is told it happened.
    assert Notification.query.filter_by(
        user_id=admin_id, type="baytarian_auto_approved").count() == 1


def test_a_national_id_that_says_something_else_is_refused_without_a_queue_entry(app, monkeypatch):
    uid = _account(national_id=NATIONAL_ID)
    _stub_judge(monkeypatch, _verdict(
        document_type="Egyptian national ID card", national_id=NATIONAL_ID,
        occupation="مهندس", occupation_is_veterinarian=False))

    response = _upload(_client(app), route="national_id")

    assert response.status_code == 422
    assert response.get_json()["error"] == "occupation_not_veterinarian"
    # A definite no is told to the applicant, not parked in an admin's queue.
    assert BaytarianRequest.query.count() == 0
    assert not db.session.get(User, uid).is_baytarian


def test_a_document_nobody_can_place_becomes_an_ordinary_pending_request(app, monkeypatch):
    uid = _account()
    _stub_judge(monkeypatch, _verdict(document_type="a letter", confidence="low"))

    response = _upload(_client(app))

    assert response.status_code == 202
    assert response.get_json()["pending"] is True
    row = BaytarianRequest.query.filter_by(user_id=uid).one()
    assert row.status == "pending" and row.grant is None
    # The reading is kept, so the admin opens the request already knowing what it says.
    assert row.ai_verdict["confidence"] == "low"
    assert not row.auto_approved
    user = db.session.get(User, uid)
    assert not user.is_baytarian and not user.is_vet_student


def test_no_api_key_means_a_human_decides_rather_than_the_applicant_being_turned_away(app, monkeypatch):
    _account()
    _stub_judge(monkeypatch, None)          # what judge() returns with no key configured

    response = _upload(_client(app))

    assert response.status_code == 202
    assert BaytarianRequest.query.one().status == "pending"


def test_an_edited_image_is_refused(app, monkeypatch):
    _account()
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True, tampered=True))

    response = _upload(_client(app))

    assert response.status_code == 422
    assert response.get_json()["error"] == "looks_edited"
    assert BaytarianRequest.query.count() == 0


def test_admin_approval_of_a_student_request_grants_the_student_status(app, monkeypatch):
    uid = _account()
    _account(email="admin@example.test", role="admin")
    _stub_judge(monkeypatch, _verdict(confidence="low"))
    _upload(_client(app))
    rid = BaytarianRequest.query.one().id

    admin = _client(app, email="admin@example.test")
    response = admin.post(f"/api/v1/admin/baytarian-requests/{rid}/approve",
                          json={"grant": "vet_student"})

    assert response.status_code == 200, response.get_json()
    user = db.session.get(User, uid)
    assert user.is_vet_student and not user.is_baytarian


def test_revoking_an_auto_approval_takes_the_status_back(app, monkeypatch):
    uid = _account()
    _account(email="admin@example.test", role="admin")
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True))
    _upload(_client(app))
    rid = BaytarianRequest.query.one().id
    assert db.session.get(User, uid).is_vet_student

    admin = _client(app, email="admin@example.test")
    response = admin.post(f"/api/v1/admin/baytarian-requests/{rid}/revoke",
                          json={"reason": "بطاقة غير مقروءة"})

    assert response.status_code == 200, response.get_json()
    assert not db.session.get(User, uid).is_vet_student
    row = db.session.get(BaytarianRequest, rid)
    assert row.status == "rejected" and row.reject_reason == "بطاقة غير مقروءة"
    assert Notification.query.filter_by(user_id=uid, type="baytarian_revoked").count() == 1


def test_a_verified_veterinarian_is_not_sent_round_again(app, monkeypatch):
    uid = _account()
    db.session.get(User, uid).is_baytarian = True
    db.session.commit()
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True))

    assert _upload(_client(app)).status_code == 409


def test_a_document_is_required(app, monkeypatch):
    _account()
    _stub_judge(monkeypatch, _verdict())
    client = _client(app)
    assert client.post("/api/v1/baytarian/document", data={"route": "other"},
                       content_type="multipart/form-data").status_code == 400
    assert _upload(client, route="passport").status_code == 400
