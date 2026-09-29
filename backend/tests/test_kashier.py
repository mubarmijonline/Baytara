"""Kashier gateway readiness (real DB, mocked HTTP). Needs nothing from Kashier itself.

The keys are not issued yet, so what is proved here is everything that has to be right
the day they are: the gateway stays invisible until it is configured, checkout picks it
over the old one once it is, the signature rule matches Kashier's published one, and a
correctly signed event for the wrong amount grants nothing.
"""
import hashlib
import hmac
import urllib.parse

import pytest

import app.api.v1.payment as paymod
import app.services.kashier as kashier
from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, Enrollment, Payment, Setting, User

MERCHANT = "MID-0000-000"
SECRET = "test-secret-key"
API_KEY = "test-payment-api-key"


@pytest.fixture
def kashier_app(tmp_path, monkeypatch):
    config = type("KashierConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'kashier.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    sessions = [5000]

    def fake_session(amount, currency, order_reference, customer, description,
                     redirect_url, webhook_url, failure_url=None, language="ar"):
        sessions[0] += 1
        return {"url": f"https://checkout.example.test/{sessions[0]}",
                "session_id": f"sess-{sessions[0]}", "order": str(order_reference)}

    monkeypatch.setattr(paymod.kashier, "create_session", fake_session)
    with app.app_context():
        db.create_all()
        instructor = User(name="Instructor", email="kashier-instructor@example.test",
                          password_hash="hash", role="instructor")
        category = Category(name="Kashier category", slug="kashier-category")
        db.session.add_all([instructor, category])
        db.session.flush()
        course = Course(title="Paid course", slug="kashier-paid-course", instructor_id=instructor.id,
                        category_id=category.id, status="published", access_type="general", price=990)
        db.session.add(course)
        db.session.commit()
        yield app, {"course_id": course.id}
        db.session.remove()
        db.drop_all()


def _configure(live=False):
    for key, value in (("secret_kashier_merchant_id", MERCHANT),
                       ("secret_kashier_secret", SECRET),
                       ("secret_kashier_api_key", API_KEY),
                       ("kashier_mode", "live" if live else "test")):
        row = db.session.get(Setting, key)
        if row:
            row.value = value
        else:
            db.session.add(Setting(key=key, value=value))
    db.session.commit()


def _student_headers(client, email="kashier-student@example.test"):
    client.post("/api/v1/auth/register", json={
        "name": "Student", "email": email, "phone": "+201000000000", "password": "secret12",
    })
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "secret12"})
    return {"Authorization": f"Bearer {login.get_json()['access_token']}"}


def _signed(data, api_key=API_KEY):
    """Build a webhook body the way Kashier documents it: the fields named in
    signatureKeys, sorted, values URL-encoded, joined as a query string, HMAC-SHA256."""
    keys = sorted(data["signatureKeys"])
    message = "&".join(f"{k}={urllib.parse.quote(str(data.get(k, '')), safe='')}" for k in keys)
    return hmac.new(api_key.encode(), message.encode(), hashlib.sha256).hexdigest()


def test_the_gateway_stays_invisible_until_its_keys_are_in(kashier_app):
    app, _ = kashier_app
    client = app.test_client()
    with app.app_context():
        assert kashier.configured() is False
        assert set(kashier.missing_keys()) == {"merchant_id", "secret_key", "api_key"}

    body = client.get("/api/v1/payment/gateway").get_json()
    assert body == {"gateway": None, "ready": False}

    headers = _student_headers(client)
    refused = client.post("/api/v1/payment/checkout", headers=headers, json={
        "kind": "enroll", "course_id": kashier_app[1]["course_id"],
    })
    assert refused.status_code == 503
    assert refused.get_json()["error"] == "gateway_not_configured"


def test_checkout_uses_kashier_once_the_keys_are_in(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    headers = _student_headers(client)
    with app.app_context():
        _configure()
        assert kashier.configured() is True
        assert kashier.missing_keys() == []

    assert client.get("/api/v1/payment/gateway").get_json() == {"gateway": "kashier", "ready": True}

    response = client.post("/api/v1/payment/checkout", headers=headers, json={
        "kind": "enroll", "course_id": data["course_id"],
    })
    assert response.status_code == 201, response.get_json()
    created = response.get_json()
    assert created["gateway"] == "kashier"
    assert created["url"].startswith("https://checkout.example.test/")

    with app.app_context():
        payment = db.session.get(Payment, created["payment_id"])
        assert payment.gateway == "kashier"
        assert payment.status == "pending"
        assert float(payment.amount) == 990.0
        # No migration was needed: the session id rides in the column the old gateway
        # used for its invoice key.
        assert payment.invoice_key.startswith("sess-")


def _webhook(client, payment_id, amount="990.00", status="SUCCESS", event="pay", api_key=API_KEY):
    data = {
        "amount": amount, "currency": "EGP", "status": status,
        "merchantOrderId": str(payment_id), "kashierOrderId": "kashier-order-1",
        "transactionId": "txn-1", "method": "card",
        "signatureKeys": ["amount", "currency", "kashierOrderId", "merchantOrderId"],
    }
    return client.post("/api/v1/payment/kashier/webhook",
                       json={"event": event, "data": data},
                       headers={"x-kashier-signature": _signed(data, api_key)})


def test_a_signed_paid_event_enrolls_the_buyer_once(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    headers = _student_headers(client)
    with app.app_context():
        _configure()
    created = client.post("/api/v1/payment/checkout", headers=headers, json={
        "kind": "enroll", "course_id": data["course_id"],
    }).get_json()

    assert _webhook(client, created["payment_id"]).status_code == 200
    # Kashier re-delivers; the second one must not enroll again.
    assert _webhook(client, created["payment_id"]).status_code == 200

    with app.app_context():
        payment = db.session.get(Payment, created["payment_id"])
        assert payment.status == "paid"
        assert payment.reference_number == "txn-1"
        assert payment.invoice_id == "kashier-order-1"
        rows = Enrollment.query.filter_by(user_id=payment.user_id, course_id=data["course_id"]).all()
        assert len(rows) == 1
        assert rows[0].status == "active"


def test_an_unsigned_or_wrongly_signed_event_grants_nothing(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    headers = _student_headers(client)
    with app.app_context():
        _configure()
    created = client.post("/api/v1/payment/checkout", headers=headers, json={
        "kind": "enroll", "course_id": data["course_id"],
    }).get_json()

    assert _webhook(client, created["payment_id"], api_key="somebody-elses-key").status_code == 400
    unsigned = client.post("/api/v1/payment/kashier/webhook", json={"event": "pay", "data": {
        "amount": "990.00", "status": "SUCCESS", "merchantOrderId": str(created["payment_id"]),
    }})
    assert unsigned.status_code == 400

    with app.app_context():
        assert db.session.get(Payment, created["payment_id"]).status == "pending"
        assert Enrollment.query.count() == 0


def test_a_correctly_signed_event_for_the_wrong_amount_is_refused(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    headers = _student_headers(client)
    with app.app_context():
        _configure()
    created = client.post("/api/v1/payment/checkout", headers=headers, json={
        "kind": "enroll", "course_id": data["course_id"],
    }).get_json()

    mismatched = _webhook(client, created["payment_id"], amount="1.00")
    assert mismatched.status_code == 409
    assert mismatched.get_json()["error"] == "amount_mismatch"

    with app.app_context():
        assert db.session.get(Payment, created["payment_id"]).status == "pending"
        assert Enrollment.query.count() == 0


def test_a_failure_is_recorded_without_touching_a_payment_already_paid(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    headers = _student_headers(client)
    with app.app_context():
        _configure()
    created = client.post("/api/v1/payment/checkout", headers=headers, json={
        "kind": "enroll", "course_id": data["course_id"],
    }).get_json()

    assert _webhook(client, created["payment_id"], status="FAILURE").status_code == 200
    with app.app_context():
        assert db.session.get(Payment, created["payment_id"]).status == "failed"

    assert _webhook(client, created["payment_id"]).status_code == 200
    # A late failure after a real payment must not un-sell the course.
    assert _webhook(client, created["payment_id"], status="FAILURE").status_code == 200
    with app.app_context():
        assert db.session.get(Payment, created["payment_id"]).status == "paid"


def test_test_and_live_hit_different_hosts(kashier_app):
    app, _ = kashier_app
    with app.app_context():
        _configure(live=False)
        assert kashier._base() == "https://test-api.kashier.io"
        _configure(live=True)
        assert kashier._base() == "https://api.kashier.io"
