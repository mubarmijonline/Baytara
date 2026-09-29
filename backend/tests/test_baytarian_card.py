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


def _stub_vision(monkeypatch, front=SAMPLE_FRONT, back=SAMPLE_BACK):
    """Stub Google's client, not extract_text, so the real upload-to-bytes path runs.

    Stubbing extract_text once hid a TypeError: the endpoint hands it an uploaded file
    and it only accepted a path, so every card came back as "service unavailable".
    """
    import sys
    import types

    class FakeResponse:
        def __init__(self, text):
            self.error = types.SimpleNamespace(message="")
            self.text_annotations = [types.SimpleNamespace(description=text)]

    class FakeClient:
        def text_detection(self, image):
            # The bytes must actually have arrived: b"...front" or b"...back".
            assert image.content, "no image bytes reached Vision"
            return FakeResponse(front if b"front" in image.content else back)

    module = types.ModuleType("google.cloud.vision")
    module.ImageAnnotatorClient = FakeClient
    module.Image = lambda content: types.SimpleNamespace(content=content)
    monkeypatch.setitem(sys.modules, "google.cloud.vision", module)


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
    _stub_vision(monkeypatch, front=SAMPLE_FRONT.replace("٢٠٢٨/٠٩", "٢٠٢٠/٠١"))
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


def test_the_card_alone_verifies_and_records_its_national_id(app, monkeypatch):
    """No typed national ID is needed (client, 2026-09-28). This used to be refused."""
    with app.app_context():
        _account()      # no national ID recorded
    _stub_vision(monkeypatch)
    client = _client(app)

    preview = client.post("/api/v1/baytarian/card/preview", data=_sides(),
                          content_type="multipart/form-data").get_json()["report"]
    assert preview["complete"], preview
    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 201
    with app.app_context():
        user = User.query.filter_by(email="vet@example.test").first()
        assert user.is_baytarian
        # Recorded from the card, so the same card cannot verify a second account.
        assert user.national_id == NATIONAL_ID


def test_without_a_typed_id_a_card_already_on_another_account_is_refused(app, monkeypatch):
    with app.app_context():
        _account(email="owner@example.test", national_id=NATIONAL_ID)
        _account()      # no national ID recorded
    _stub_vision(monkeypatch)
    client = _client(app)

    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 422
    assert response.get_json()["report"]["fields"]["national_id"]["problem"] == "card_already_used"


def test_an_unreadable_card_blocks_submission(app, monkeypatch):
    with app.app_context():
        _account(national_id=NATIONAL_ID)
    _stub_vision(monkeypatch, front="", back="")
    client = _client(app)

    response = client.post("/api/v1/baytarian/card", data=_sides(),
                           content_type="multipart/form-data")
    assert response.status_code == 422
    fields = response.get_json()["report"]["fields"]
    assert fields["name"]["problem"] == "unreadable"


def test_a_vision_outage_reports_itself_rather_than_failing(app, monkeypatch):
    import sys
    import types

    with app.app_context():
        _account(national_id=NATIONAL_ID)

    class BoomClient:
        def text_detection(self, image):
            raise RuntimeError("Vision error: quota")

    module = types.ModuleType("google.cloud.vision")
    module.ImageAnnotatorClient = BoomClient
    module.Image = lambda content: types.SimpleNamespace(content=content)
    monkeypatch.setitem(sys.modules, "google.cloud.vision", module)
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


def test_the_id_card_photo_records_the_number_and_stays_private(app, monkeypatch, tmp_path):
    """The learner uploads a photo of their national ID; the number is read off it and
    mapped to the account, and the image is never served publicly."""
    import sys
    import types

    ID_CARD = "بطاقة تحقيق الشخصية\nالرقم القومى ٢٧٨١١٢٩١٨٠١٥٣٦"

    class Response:
        def __init__(self):
            self.error = types.SimpleNamespace(message="")
            self.text_annotations = [types.SimpleNamespace(description=ID_CARD)]

    class Client:
        def text_detection(self, image):
            assert image.content, "no image bytes reached Vision"
            return Response()

    module = types.ModuleType("google.cloud.vision")
    module.ImageAnnotatorClient = Client
    module.Image = lambda content: types.SimpleNamespace(content=content)
    monkeypatch.setitem(sys.modules, "google.cloud.vision", module)

    with app.app_context():
        uid = _account()            # nothing recorded yet
    client = _client(app)

    card = {"file": (io.BytesIO(b"\xff\xd8idcard"), "id.jpg")}
    response = client.post("/api/v1/auth/national-id", data=card, content_type="multipart/form-data")
    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body["national_id"] == NATIONAL_ID
    assert body["born"] == "1978-11-29" and body["governorate"] == "البحيرة"
    assert body["user"]["national_id_locked"] and body["user"]["has_national_id_image"]

    with app.app_context():
        user = db.session.get(User, uid)
        assert user.national_id == NATIONAL_ID
        # stored with the verification documents, not in the public uploads folder
        assert app.config["BAYTARIAN_DOC_DIR"] in user.national_id_image
        assert "uploads" not in user.national_id_image

    # the owner can see their own image back
    assert client.get("/api/v1/auth/national-id/image").status_code == 200
    # ...and a stranger cannot: the endpoint takes no user id at all
    assert app.test_client().get("/api/v1/auth/national-id/image").status_code == 401

    # a second account cannot claim the same number
    with app.app_context():
        _account(email="second@example.test")
    second = _client(app, email="second@example.test")
    clash = second.post("/api/v1/auth/national-id", data={"file": (io.BytesIO(b"\xff\xd8x"), "id.jpg")},
                        content_type="multipart/form-data")
    assert clash.status_code == 409 and clash.get_json()["error"] == "already_used"


def test_an_id_photo_of_someone_else_is_refused(app, monkeypatch):
    """Once a number is on file the photo has to be of that same person."""
    import sys
    import types

    class Client:
        def text_detection(self, image):
            return types.SimpleNamespace(
                error=types.SimpleNamespace(message=""),
                text_annotations=[types.SimpleNamespace(description="الرقم القومى ٢٩٠٠١٠١١٨٠١٢٣٤")])

    module = types.ModuleType("google.cloud.vision")
    module.ImageAnnotatorClient = Client
    module.Image = lambda content: types.SimpleNamespace(content=content)
    monkeypatch.setitem(sys.modules, "google.cloud.vision", module)

    with app.app_context():
        _account(national_id=NATIONAL_ID)
    client = _client(app)
    response = client.post("/api/v1/auth/national-id",
                           data={"file": (io.BytesIO(b"\xff\xd8x"), "id.jpg")},
                           content_type="multipart/form-data")
    assert response.status_code == 422
    assert response.get_json()["error"] == "does_not_match_profile"
