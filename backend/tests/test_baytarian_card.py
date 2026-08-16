"""Self-service vet verification from the syndicate card.

Vision is stubbed: the parser has its own offline test, and these cover the rules the
API enforces around it. Run with pytest.
"""
import io

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import BaytarianRequest, User
from app.security import hash_password
from tests.test_vet_card import SAMPLE_BACK, SAMPLE_FRONT

NATIONAL_ID = "27811291801536"


@pytest.fixture
def app(tmp_path):
    config = type("CardConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'card.sqlite'}",
        "BAYTARIAN_DOC_DIR": str(tmp_path / "docs"),
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def _account(email="vet@example.test", national_id=None, verified=False):
    user = User(name="د. محمد", email=email, password_hash=hash_password("secret12"),
                role="student", national_id=national_id, is_baytarian=verified)
    db.session.add(user)
    db.session.commit()
    return user.id


def _client(app, email="vet@example.test"):
    client = app.test_client()
    token = client.post("/api/v1/auth/login",
                        json={"email": email, "password": "secret12"}).get_json()["access_token"]
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {token}"
    return client


def _stub_vision(monkeypatch, back=SAMPLE_BACK, front=SAMPLE_FRONT):
    """Vision reads whichever side it is handed; the filename says which."""
    from app.services import instapay_ocr

    def fake(storage):
        return front if "front" in getattr(storage, "filename", "") else back

    monkeypatch.setattr(instapay_ocr, "extract_text", fake)


def _sides():
    return {
        "front": (io.BytesIO(b"\xff\xd8front"), "front.jpg"),
        "back": (io.BytesIO(b"\xff\xd8back"), "back.jpg"),
    }


def test_preview_reads_the_card_without_saving_anything(app, monkeypatch):
    with app.app_context():
        _account(national_id=NATIONAL_ID)
    _stub_vision(monkeypatch)
    client = _client(app)

    response = client.post("/api/v1/baytarian/card/preview", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 200, response.get_json()
    report = response.get_json()["report"]
    assert report["complete"], report
    assert report["fields"]["registration_no"]["value"] == "28834"
    assert report["fields"]["expires_at"]["value"] == "2028-09-30"

    with app.app_context():
        # a preview is a look, not a decision
        assert BaytarianRequest.query.count() == 0
        assert db.session.get(User, 1).is_baytarian is False


def test_a_clean_card_verifies_the_account_by_itself(app, monkeypatch):
    with app.app_context():
        uid = _account(national_id=NATIONAL_ID)
    _stub_vision(monkeypatch)
    client = _client(app)

    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body["is_baytarian"] and body["request"]["status"] == "approved"
    assert body["request"]["auto_approved"]

    with app.app_context():
        user = db.session.get(User, uid)
        assert user.is_baytarian
        assert user.vet_registration_no == "28834" and user.vet_license_no == "28925"
        assert user.vet_governorate == "البحيرة"
        assert user.vet_card_expires_at.isoformat() == "2028-09-30"
        req = BaytarianRequest.query.one()
        # the evidence is kept: both images, what Vision read, and every verdict
        assert req.card_front and req.card_back and req.ocr_text
        assert req.parsed["fields"]["name"]["value"] == "محمد غريب محمد خضر"
        assert req.reviewed_by is None      # approved by the system, not a person


def test_a_card_belonging_to_someone_else_is_refused(app, monkeypatch):
    with app.app_context():
        _account(national_id="29001011801234")   # a different, valid national ID
    _stub_vision(monkeypatch)
    client = _client(app)

    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 422
    body = response.get_json()
    assert body["error"] == "card_not_verified"
    assert body["report"]["fields"]["national_id"]["problem"] == "does_not_match_profile"
    with app.app_context():
        # a card that does not check out leaves nothing behind
        assert BaytarianRequest.query.count() == 0
        assert db.session.get(User, 1).is_baytarian is False


def test_an_expired_card_is_refused(app, monkeypatch):
    with app.app_context():
        _account(national_id=NATIONAL_ID)
    _stub_vision(monkeypatch, back=SAMPLE_BACK.replace("٢٠٢٨/٠٩", "٢٠٢٠/٠١"))
    client = _client(app)

    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 422
    assert response.get_json()["report"]["fields"]["expires_at"]["problem"] == "expired"


def test_one_card_verifies_one_account(app, monkeypatch):
    with app.app_context():
        _account(national_id=NATIONAL_ID)
        # somebody already verified with this card
        holder = User(name="الأول", email="first@example.test", password_hash="hash",
                      role="student", is_baytarian=True,
                      vet_registration_no="28834", vet_license_no="28925")
        db.session.add(holder)
        db.session.commit()
    _stub_vision(monkeypatch)
    client = _client(app)

    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 422
    assert response.get_json()["report"]["fields"]["registration_no"]["problem"] == "card_already_used"


def test_a_national_id_is_needed_before_the_card(app, monkeypatch):
    with app.app_context():
        _account()      # no national ID recorded
    _stub_vision(monkeypatch)
    client = _client(app)

    assert client.post("/api/v1/baytarian/card", data=_sides(),
                       content_type="multipart/form-data").status_code == 422
    preview = client.post("/api/v1/baytarian/card/preview", data=_sides(),
                          content_type="multipart/form-data").get_json()["report"]
    assert "national_id_missing_on_profile" in preview["problems"]


def test_an_unreadable_card_blocks_submission(app, monkeypatch):
    with app.app_context():
        _account(national_id=NATIONAL_ID)
    _stub_vision(monkeypatch, back="", front="")
    client = _client(app)

    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 422
    fields = response.get_json()["report"]["fields"]
    assert fields["name"]["problem"] == "unreadable"


def test_a_vision_outage_reports_itself_rather_than_failing(app, monkeypatch):
    from app.services import instapay_ocr

    with app.app_context():
        _account(national_id=NATIONAL_ID)

    def boom(_storage):
        raise RuntimeError("Vision error: quota")

    monkeypatch.setattr(instapay_ocr, "extract_text", boom)
    client = _client(app)
    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 503 and response.get_json()["error"] == "ocr_unavailable"


def test_the_national_id_is_write_once_and_unique(app):
    with app.app_context():
        _account()
        _account(email="other@example.test", national_id=NATIONAL_ID)
    client = _client(app)

    # Arabic-Indic input is converted, not refused
    ok = client.patch("/api/v1/auth/profile", json={"national_id": "٢٩٠٠١٠١١٨٠١٢٣٤"})
    assert ok.status_code == 200, ok.get_json()
    assert ok.get_json()["user"]["national_id"] == "29001011801234"
    assert ok.get_json()["user"]["national_id_locked"] is True

    # ...and cannot be changed afterwards
    locked = client.patch("/api/v1/auth/profile", json={"national_id": "27811291801537"})
    assert locked.status_code == 422
    assert locked.get_json()["messages"]["national_id"] == ["locked"]

    # a fresh account cannot claim a number another account already holds
    with app.app_context():
        _account(email="third@example.test")
    third = _client(app, email="third@example.test")
    clash = third.patch("/api/v1/auth/profile", json={"national_id": NATIONAL_ID})
    assert clash.status_code == 422
    assert clash.get_json()["messages"]["national_id"] == ["already_used"]

    junk = third.patch("/api/v1/auth/profile", json={"national_id": "123"})
    assert junk.status_code == 422 and junk.get_json()["messages"]["national_id"] == ["length"]


def test_a_national_id_never_leaves_through_a_public_endpoint(app):
    with app.app_context():
        uid = _account(national_id=NATIONAL_ID)
        user = db.session.get(User, uid)
        user.role = "instructor"
        db.session.commit()
        assert "national_id" not in user.public_profile()

    body = app.test_client().get(f"/api/v1/instructors/{uid}").get_json()
    assert "national_id" not in str(body), body
