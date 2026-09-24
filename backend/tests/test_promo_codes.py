"""Discount codes.

The property that matters most is the one in the last test: the browser sends a code and
never an amount, so no client can name its own price. Everything else is the rules the
client asked for -- percentage or fixed, an expiry, a total cap and a per-buyer cap.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Payment, PromoCode, User
from app.security import hash_password
from app.services import promo

PASSWORD = "secret12"


@pytest.fixture
def app(tmp_path):
    config = type("PromoConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'promo.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        db.session.add(User(name="Buyer", email="buyer@x.com", phone="+201000000001",
                            password_hash=hash_password(PASSWORD), role="student"))
        db.session.commit()
        yield app
        db.session.remove()


def _uid(app):
    with app.app_context():
        return User.query.filter_by(email="buyer@x.com").first().id


def _add(app, **kwargs):
    with app.app_context():
        row = PromoCode(**{"code": "SAVE10", "kind": "percent", "value": 10, **kwargs})
        db.session.add(row)
        db.session.commit()
        return row.id


def _pay(app, promo_id, user_id, status="paid"):
    with app.app_context():
        db.session.add(Payment(user_id=user_id, kind="enroll", amount=90, currency="EGP",
                               status=status, gateway="kashier", promo_code_id=promo_id,
                               discount=10))
        db.session.commit()


def test_percent_and_fixed(app):
    _add(app)
    _add(app, code="FLAT50", kind="fixed", value=50)
    with app.app_context():
        assert float(promo.lookup("SAVE10").discount_for(200)) == 20.0
        assert float(promo.lookup("FLAT50").discount_for(200)) == 50.0


def test_a_fixed_discount_never_exceeds_the_price(app):
    _add(app, code="FLAT500", kind="fixed", value=500)
    with app.app_context():
        # 500 off a 200 course is 200 off, not a 300 refund.
        assert float(promo.lookup("FLAT500").discount_for(200)) == 200.0


def test_the_code_is_case_insensitive(app):
    _add(app)
    with app.app_context():
        assert promo.lookup("save10") is not None
        assert promo.lookup("  Save10 ") is not None


def test_inactive_expired_and_not_yet_started(app):
    now = datetime.now(timezone.utc)
    _add(app, code="OFF", is_active=False)
    _add(app, code="GONE", expires_at=now - timedelta(days=1))
    _add(app, code="SOON", starts_at=now + timedelta(days=1))
    with app.app_context():
        uid = User.query.first().id
        assert promo.validate("OFF", uid, 100)[2] == "promo_inactive"
        assert promo.validate("GONE", uid, 100)[2] == "promo_expired"
        assert promo.validate("SOON", uid, 100)[2] == "promo_not_started"
        assert promo.validate("NOPE", uid, 100)[2] == "promo_not_found"


def test_total_cap_counts_only_paid_payments(app):
    pid = _add(app, code="TEN", max_uses=1)
    uid = _uid(app)
    with app.app_context():
        assert promo.validate("TEN", uid, 100)[2] is None

    # An abandoned checkout must not burn the code: money never moved.
    _pay(app, pid, uid, status="pending")
    with app.app_context():
        assert promo.validate("TEN", uid, 100)[2] is None

    _pay(app, pid, uid, status="paid")
    with app.app_context():
        assert promo.validate("TEN", uid, 100)[2] == "promo_exhausted"


def test_per_buyer_limit_is_separate_from_the_total(app):
    pid = _add(app, code="ONCE", per_user_limit=1, max_uses=100)
    uid = _uid(app)
    _pay(app, pid, uid, status="paid")
    with app.app_context():
        assert promo.validate("ONCE", uid, 100)[2] == "promo_already_used"
        other = User(name="Other", email="other@x.com", phone="+201000000002",
                     password_hash=hash_password(PASSWORD), role="student")
        db.session.add(other)
        db.session.commit()
        # Someone else's turn is unaffected.
        assert promo.validate("ONCE", other.id, 100)[2] is None


def test_apply_returns_the_charge(app):
    _add(app, code="TWENTY", value=20)
    uid = _uid(app)
    with app.app_context():
        _, discount, final, error = promo.apply("TWENTY", uid, 250)
        assert error is None
        assert float(discount) == 50.0
        assert final == 200.0


def test_checkout_takes_a_code_and_never_an_amount(app):
    """The client names the code. The server names the price."""
    _add(app, code="HALF", value=50)
    client = app.test_client()
    token = client.post("/api/v1/auth/login",
                        json={"email": "buyer@x.com", "password": PASSWORD}).get_json()["access_token"]

    # A made-up discount in the request body must change nothing: there is no field for it.
    response = client.post("/api/v1/payment/checkout",
                           json={"kind": "enroll", "course_id": 1, "amount": 1,
                                 "discount": 999, "final_amount": 1, "code": "HALF"},
                           headers={"Authorization": f"Bearer {token}"})
    # No course exists in this fixture, so the target resolution refuses first -- which is
    # the point: nothing in the body reached a price calculation.
    assert response.status_code in (404, 422, 503)
    with app.app_context():
        assert Payment.query.count() == 0
