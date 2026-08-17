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
            "expired": False, "name_match": "same", "tampered": False,
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


def test_a_student_card_verifies_the_account_and_records_the_kind(app, monkeypatch):
    uid = _account()
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True))
    response = _upload(_client(app))

    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    # One verified status. Both kinds are veterinarians; only the marker differs.
    assert body["is_baytarian"] is True
    assert body["is_vet_student"] is True
    user = db.session.get(User, uid)
    assert user.is_baytarian and user.is_vet_student

    request_row = BaytarianRequest.query.filter_by(user_id=uid).one()
    assert (request_row.status, request_row.grant, request_row.route) == (
        "approved", "vet_student", "other")
    assert request_row.auto_approved and request_row.reviewed_by is None
    assert request_row.ai_verdict["document_type"] == "veterinary college student ID"


def test_a_verified_student_reaches_the_same_content_as_a_licensed_vet(app):
    from app.services.catalog_access import audience_error

    student = User(name="s", email="s@example.test", password_hash="x",
                   is_baytarian=True, is_vet_student=True)
    licensed = User(name="l", email="l@example.test", password_hash="x", is_baytarian=True)
    outsider = User(name="o", email="o@example.test", password_hash="x")
    for tier in ("vet_free", "baytarian"):
        assert audience_error(student, tier) is None, tier
        assert audience_error(licensed, tier) is None, tier
        assert audience_error(outsider, tier) == "needs_baytarian", tier
    # Being verified veterinarians, neither belongs to the non-vet audience.
    assert audience_error(student, "general") == "non_veterinarians_only"


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


def test_the_number_read_off_the_card_becomes_the_account_identity(app, monkeypatch):
    """An applicant with no national ID on file is the normal case at this door. Without
    storing what was read there is nothing tying the document to the account, and the
    same card verifies as many accounts as it is uploaded to."""
    uid = _account()                      # no national ID on the profile
    _stub_judge(monkeypatch, _verdict(
        document_type="Egyptian national ID card", national_id=NATIONAL_ID,
        occupation="طبيب بيطري", occupation_is_veterinarian=True))

    assert _upload(_client(app), route="national_id").status_code == 201
    assert db.session.get(User, uid).national_id == NATIONAL_ID


def test_the_same_card_cannot_verify_a_second_account(app, monkeypatch):
    _account(email="first@example.test", national_id=NATIONAL_ID)
    second = _account(email="second@example.test")
    _stub_judge(monkeypatch, _verdict(
        document_type="Egyptian national ID card", national_id=NATIONAL_ID,
        occupation="طبيب بيطري", occupation_is_veterinarian=True))

    response = _upload(_client(app, email="second@example.test"), route="national_id")

    assert response.status_code == 422
    assert response.get_json()["error"] == "card_already_used"
    assert not db.session.get(User, second).is_baytarian


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


def test_approving_needs_no_choice_of_kind(app, monkeypatch):
    """The admin presses one Verify. Which document it was is already on the request,
    so the server keeps that rather than asking them to pick it again."""
    uid = _account()
    _account(email="admin@example.test", role="admin")
    _stub_judge(monkeypatch, _verdict(confidence="low"))
    _upload(_client(app))
    rid = BaytarianRequest.query.one().id

    admin = _client(app, email="admin@example.test")
    response = admin.post(f"/api/v1/admin/baytarian-requests/{rid}/approve")

    assert response.status_code == 200, response.get_json()
    user = db.session.get(User, uid)
    assert user.is_baytarian
    # Nothing was read off this one, so it records the plain licensed kind.
    assert db.session.get(BaytarianRequest, rid).grant == "baytarian"
    assert Notification.query.filter_by(user_id=uid, type="baytarian_approved").count() == 1


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
    assert user.is_baytarian and user.is_vet_student


def test_revoking_an_auto_approval_takes_the_status_back(app, monkeypatch):
    uid = _account()
    _account(email="admin@example.test", role="admin")
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True))
    _upload(_client(app))
    rid = BaytarianRequest.query.one().id
    assert db.session.get(User, uid).is_baytarian

    admin = _client(app, email="admin@example.test")
    response = admin.post(f"/api/v1/admin/baytarian-requests/{rid}/revoke",
                          json={"reason": "بطاقة غير مقروءة"})

    assert response.status_code == 200, response.get_json()
    revoked = db.session.get(User, uid)
    assert not revoked.is_baytarian and not revoked.is_vet_student
    row = db.session.get(BaytarianRequest, rid)
    assert row.status == "rejected" and row.reject_reason == "بطاقة غير مقروءة"
    assert Notification.query.filter_by(user_id=uid, type="baytarian_revoked").count() == 1


def test_a_verified_veterinarian_is_not_sent_round_again(app, monkeypatch):
    uid = _account()
    db.session.get(User, uid).is_baytarian = True
    db.session.commit()
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True))

    assert _upload(_client(app)).status_code == 409


def test_a_name_belonging_to_someone_else_is_refused_outright(app, monkeypatch):
    """Positively the wrong person is a rejection, not a review — and it outranks a
    document that is otherwise perfect."""
    uid = _account(national_id=NATIONAL_ID)
    _stub_judge(monkeypatch, _verdict(
        document_type="Egyptian national ID card", national_id=NATIONAL_ID,
        occupation="طبيب بيطري", occupation_is_veterinarian=True, name_match="different"))

    response = _upload(_client(app), route="national_id")

    assert response.status_code == 422
    assert response.get_json()["error"] == "name_does_not_match"
    assert BaytarianRequest.query.count() == 0
    assert not db.session.get(User, uid).is_baytarian


def test_a_name_written_differently_is_the_same_person(app, monkeypatch):
    uid = _account()
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True, name_match="similar"))

    assert _upload(_client(app)).status_code == 201
    assert db.session.get(User, uid).is_baytarian


def test_a_name_that_cannot_be_read_is_reviewed_rather_than_refused(app, monkeypatch):
    """The difference that matters: the document says the wrong thing (refuse) versus
    the document says nothing legible (review)."""
    _account()
    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True, name_match="unreadable"))

    assert _upload(_client(app)).status_code == 202
    assert BaytarianRequest.query.one().status == "pending"


def test_a_national_id_whose_occupation_box_is_illegible_is_reviewed(app, monkeypatch):
    _account(national_id=NATIONAL_ID)
    _stub_judge(monkeypatch, _verdict(
        document_type="Egyptian national ID card", national_id=NATIONAL_ID, occupation=""))

    assert _upload(_client(app), route="national_id").status_code == 202
    assert BaytarianRequest.query.one().status == "pending"


def test_only_one_request_may_be_open_at_a_time(app, monkeypatch):
    """A second submission while one is still being reviewed would give an admin two
    versions of the same person to decide between."""
    _account()
    _stub_judge(monkeypatch, _verdict(confidence="low"))
    client = _client(app)
    assert _upload(client).status_code == 202

    for second in (_upload(client), _upload(client, route="national_id")):
        assert second.status_code == 409
        assert second.get_json()["error"] == "request_pending"
    # The manual upload path is the same queue and is blocked too.
    manual = client.post("/api/v1/baytarian/request", content_type="multipart/form-data",
                         data={"documents": (io.BytesIO(b"x"), "a.png", "image/png")})
    assert manual.status_code == 409
    assert BaytarianRequest.query.count() == 1


def test_a_request_may_be_resubmitted_once_it_has_been_rejected(app, monkeypatch):
    uid = _account()
    _account(email="admin@example.test", role="admin")
    _stub_judge(monkeypatch, _verdict(confidence="low"))
    assert _upload(_client(app)).status_code == 202
    rid = BaytarianRequest.query.one().id
    admin = _client(app, email="admin@example.test")
    admin.post(f"/api/v1/admin/baytarian-requests/{rid}/reject", json={"reason": "غير واضح"})

    _stub_judge(monkeypatch, _verdict(is_veterinary_student=True))
    assert _upload(_client(app)).status_code == 201
    assert db.session.get(User, uid).is_baytarian


def test_the_learner_can_see_where_their_request_stands(app, monkeypatch):
    _account()
    _stub_judge(monkeypatch, _verdict(confidence="low"))
    client = _client(app)
    _upload(client)

    body = client.get("/api/v1/baytarian/me").get_json()

    assert body["is_baytarian"] is False
    assert body["request"]["status"] == "pending"
    assert body["request"]["route"] == "other"


def test_a_document_is_required(app, monkeypatch):
    _account()
    _stub_judge(monkeypatch, _verdict())
    client = _client(app)
    assert client.post("/api/v1/baytarian/document", data={"route": "other"},
                       content_type="multipart/form-data").status_code == 400
    assert _upload(client, route="passport").status_code == 400
