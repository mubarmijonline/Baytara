"""Kashier through the hosted payment page (real DB, nothing sent to Kashier).

The checkout link, the redirect signature and the webhook signature are built here the way
Kashier's own code builds them (Php-Checkout-Demo backend.php / hppCallback.php, the
kashier_python SDK), so what passes here is what Kashier will accept and send.
"""
import hashlib
import hmac
import urllib.parse

import pytest

import app.services.kashier as kashier
from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, Enrollment, Payment, Setting, User
from app.security import hash_password

MERCHANT = "MID-0000-000"
API_KEY = "test-payment-api-key"


@pytest.fixture
def kashier_app(tmp_path):
    config = type("KashierConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'kashier.sqlite'}",
        "TESTING": True,
        "SITE_URL": "https://baytara.test",
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        instructor = User(name="Instructor", email="kashier-instructor@example.test",
                          password_hash="hash", role="instructor")
        admin = User(name="Admin", email="kashier-admin@example.test",
                     password_hash=hash_password("secret12"), role="admin")
        category = Category(name="Kashier category", slug="kashier-category")
        db.session.add_all([instructor, admin, category])
        db.session.flush()
        course = Course(title="Paid course", slug="kashier-paid-course", instructor_id=instructor.id,
                        category_id=category.id, status="published", access_type="general", price=990)
        db.session.add(course)
        db.session.commit()
        yield app, {"course_id": course.id}
        db.session.remove()
        db.drop_all()


def _configure(live=True, secret=None):
    for key, value in (("secret_kashier_merchant_id", MERCHANT),
                       ("secret_kashier_api_key", API_KEY),
                       ("secret_kashier_secret", secret),
                       ("kashier_mode", "live" if live else "test")):
        row = db.session.get(Setting, key)
        if row:
            row.value = value
        else:
            db.session.add(Setting(key=key, value=value))
    db.session.commit()


def _headers(client, email="kashier-student@example.test", register=True):
    if register:
        client.post("/api/v1/auth/register", json={
            "name": "Student", "email": email, "phone": "+201000000000", "password": "secret12",
        })
    login = client.post("/api/v1/auth/login", json={"email": email, "password": "secret12"})
    return {"Authorization": f"Bearer {login.get_json()['access_token']}"}


def _checkout(client, headers, course_id):
    return client.post("/api/v1/payment/checkout", headers=headers,
                       json={"kind": "enroll", "course_id": course_id})


def _hmac(message, key=API_KEY):
    return hmac.new(key.encode(), message.encode(), hashlib.sha256).hexdigest()


def _webhook(client, payment_id, amount="990.00", status="SUCCESS", event="pay",
             api_key=API_KEY, sort=True, order_id=None):
    data = {
        "amount": amount, "currency": "EGP", "status": status,
        "merchantOrderId": order_id or f"BT-{payment_id}", "kashierOrderId": "kashier-order-1",
        "transactionId": "txn-1", "method": "card",
        "signatureKeys": ["merchantOrderId", "amount", "currency", "kashierOrderId"],
    }
    keys = sorted(data["signatureKeys"]) if sort else data["signatureKeys"]
    message = "&".join(f"{k}={urllib.parse.quote(str(data[k]), safe='')}" for k in keys)
    return client.post("/api/v1/payment/kashier/webhook", json={"event": event, "data": data},
                       headers={"x-kashier-signature": _hmac(message, api_key)})


def _return_query(payment_id, status="SUCCESS", amount="990.00", key=API_KEY, tamper=False):
    """The redirect Kashier sends back, signed the way hppCallback.php checks it: every
    param except signature and mode, in order, raw, joined k=v&k=v."""
    pairs = [("paymentStatus", status), ("cardDataToken", ""), ("maskedCard", "512345******0008"),
             ("merchantOrderId", f"BT-{payment_id}"), ("orderId", "kashier-order-9"),
             ("cardBrand", "Mastercard"), ("orderReference", "TEST-ORD-1"),
             ("transactionId", "TX-1"), ("amount", amount), ("currency", "EGP")]
    signature = _hmac("&".join(f"{k}={v}" for k, v in pairs), key)
    if tamper:
        pairs[-2] = ("amount", "1.00")
    pairs += [("mode", "live"), ("signature", signature)]
    return "/api/v1/payment/kashier/return?" + urllib.parse.urlencode(pairs)


def test_the_gateway_stays_invisible_until_its_keys_are_in(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        assert kashier.configured() is False
        assert set(kashier.missing_keys()) == {"merchant_id", "api_key"}
    assert client.get("/api/v1/payment/gateway").get_json() == {"gateway": None, "ready": False}
    refused = _checkout(client, _headers(client), data["course_id"])
    assert refused.status_code == 503 and refused.get_json()["error"] == "gateway_not_configured"


def test_the_secret_key_is_not_needed(kashier_app):
    app, _ = kashier_app
    with app.app_context():
        _configure(secret=None)
        assert kashier.configured() is True and kashier.missing_keys() == []


def test_test_mode_is_for_admins_only(kashier_app):
    """Kashier's test cards are public. A test-mode checkout open to everyone would hand
    out courses for a card number anyone can look up."""
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        _configure(live=False)
    student = _headers(client)
    assert client.get("/api/v1/payment/gateway").get_json()["ready"] is False
    assert client.get("/api/v1/payment/gateway", headers=student).get_json()["ready"] is False
    assert _checkout(client, student, data["course_id"]).status_code == 503

    admin = _headers(client, "kashier-admin@example.test", register=False)
    assert client.get("/api/v1/payment/gateway", headers=admin).get_json() == {"gateway": "kashier", "ready": True}
    created = _checkout(client, admin, data["course_id"])
    assert created.status_code == 201
    assert dict(urllib.parse.parse_qsl(urllib.parse.urlparse(created.get_json()["url"]).query))["mode"] == "test"


def test_checkout_link_is_signed_as_kashier_checks_it(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        _configure(live=True)
    created = _checkout(client, _headers(client), data["course_id"])
    assert created.status_code == 201, created.get_json()
    body = created.get_json()
    url = urllib.parse.urlparse(body["url"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == "https://checkout.kashier.io/"
    q = dict(urllib.parse.parse_qsl(url.query))
    order = f"BT-{body['payment_id']}"
    assert q["merchantId"] == MERCHANT and q["orderId"] == order
    assert q["amount"] == "990.00" and q["currency"] == "EGP" and q["mode"] == "live"
    # backend.php: hash_hmac('sha256', "/?payment=$mid.$orderId.$amount.$currency", $apikey)
    assert q["hash"] == _hmac(f"/?payment={MERCHANT}.{order}.990.00.EGP")
    assert q["merchantRedirect"] == "https://baytara.test/api/v1/payment/kashier/return"
    assert q["serverWebhook"] == "https://baytara.test/api/v1/payment/kashier/webhook"
    with app.app_context():
        payment = db.session.get(Payment, body["payment_id"])
        assert (payment.gateway, payment.status, payment.invoice_id) == ("kashier", "pending", order)
        assert float(payment.amount) == 990.0 and payment.invoice_key == "live"


@pytest.mark.parametrize("sort", [True, False])
def test_a_signed_paid_webhook_enrolls_the_buyer_once(kashier_app, sort):
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        _configure()
    created = _checkout(client, _headers(client), data["course_id"]).get_json()

    assert _webhook(client, created["payment_id"], sort=sort).status_code == 200
    assert _webhook(client, created["payment_id"], sort=sort).status_code == 200   # re-delivered

    with app.app_context():
        payment = db.session.get(Payment, created["payment_id"])
        assert payment.status == "paid" and payment.reference_number == "kashier-order-1"
        assert Enrollment.query.filter_by(user_id=payment.user_id).count() == 1
        assert db.session.get(Course, data["course_id"]).enrolled_count == 1


def test_bad_signatures_grant_nothing(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        _configure()
    created = _checkout(client, _headers(client), data["course_id"]).get_json()
    assert _webhook(client, created["payment_id"], api_key="somebody-elses-key").status_code == 400
    unsigned = client.post("/api/v1/payment/kashier/webhook", json={"event": "pay", "data": {
        "amount": "990.00", "status": "SUCCESS", "merchantOrderId": f"BT-{created['payment_id']}"}})
    assert unsigned.status_code == 400
    r = client.get(_return_query(created["payment_id"], key="somebody-elses-key"))
    assert r.status_code == 302 and "status=fail" in r.headers["Location"]
    r = client.get(_return_query(created["payment_id"], tamper=True))
    assert r.status_code == 302 and "status=fail" in r.headers["Location"]
    with app.app_context():
        assert db.session.get(Payment, created["payment_id"]).status == "pending"
        assert Enrollment.query.count() == 0


def test_signed_but_wrong_amount_or_not_ours_is_acknowledged_and_ignored(kashier_app):
    """Answer 200 so Kashier stops retrying; grant nothing."""
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        _configure()
    created = _checkout(client, _headers(client), data["course_id"]).get_json()
    r = _webhook(client, created["payment_id"], amount="1.00")
    assert r.status_code == 200 and r.get_json()["outcome"] == "amount_mismatch"
    r = _webhook(client, created["payment_id"], order_id="OTHER-SYSTEM-77")
    assert r.status_code == 200 and r.get_json()["outcome"] == "unknown_payment"
    with app.app_context():
        assert db.session.get(Payment, created["payment_id"]).status == "pending"
        assert Enrollment.query.count() == 0


def test_a_failure_never_unsells_a_paid_course(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        _configure()
    created = _checkout(client, _headers(client), data["course_id"]).get_json()
    assert _webhook(client, created["payment_id"], status="FAILURE").status_code == 200
    with app.app_context():
        assert db.session.get(Payment, created["payment_id"]).status == "failed"
    assert _webhook(client, created["payment_id"]).status_code == 200
    assert _webhook(client, created["payment_id"], status="FAILURE").status_code == 200
    with app.app_context():
        assert db.session.get(Payment, created["payment_id"]).status == "paid"


def test_the_signed_return_settles_and_the_webhook_after_it_changes_nothing(kashier_app):
    """A wallet confirmed on the phone may be seen on one path only, so either settles;
    when both arrive, the course is granted once."""
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        _configure()
    created = _checkout(client, _headers(client), data["course_id"]).get_json()
    pid = created["payment_id"]

    r = client.get(_return_query(pid))
    assert r.status_code == 302
    assert r.headers["Location"] == f"https://baytara.test/payment/callback?status=success&pid={pid}"
    assert _webhook(client, pid).status_code == 200
    with app.app_context():
        payment = db.session.get(Payment, pid)
        assert payment.status == "paid" and payment.payment_method in ("Mastercard", "card")
        assert Enrollment.query.count() == 1
        assert db.session.get(Course, data["course_id"]).enrolled_count == 1


def test_a_declined_return_shows_failure(kashier_app):
    app, data = kashier_app
    client = app.test_client()
    with app.app_context():
        _configure()
    pid = _checkout(client, _headers(client), data["course_id"]).get_json()["payment_id"]
    r = client.get(_return_query(pid, status="FAILURE"))
    assert r.headers["Location"] == f"https://baytara.test/payment/callback?status=fail&pid={pid}"
    with app.app_context():
        assert db.session.get(Payment, pid).status == "failed"


def test_order_ids_round_trip():
    assert kashier.order_id_for(41) == "BT-41"
    assert kashier.payment_id_from("BT-41") == 41
    assert [kashier.payment_id_from(v) for v in ("41", "BT-", "BT-x", "MJ-41", None)] == [None] * 5
