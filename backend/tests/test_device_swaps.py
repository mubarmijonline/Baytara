"""How often a learner may change which two devices they use.

Client rule, 2026-09-19: two devices at a time, one self-service swap per subscription
window, then an admin decides. Someone buying a new phone is covered without asking;
someone cycling machines through one account is not.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import DeviceSwapRequest, Setting, User, UserDevice
from app.security import hash_password

EMAIL, PASSWORD = "swap-student@example.test", "secret12"


@pytest.fixture
def app(tmp_path):
    config = type("SwapConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'swaps.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        db.session.add_all([
            User(name="S", email=EMAIL, password_hash=hash_password(PASSWORD), role="student"),
            User(name="A", email="swap-admin@example.test",
                 password_hash=hash_password(PASSWORD), role="admin"),
        ])
        db.session.commit()
    yield app


def signed_in(app, email=EMAIL, device="machine-1"):
    client = app.test_client()
    login = client.post("/api/v1/auth/login",
                        json={"email": email, "password": PASSWORD, "device_id": device},
                        headers={"X-Baytara-Device-Group": device})
    assert login.status_code == 200, login.get_json()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    return client


def device_id(app, group):
    with app.app_context():
        user = User.query.filter_by(email=EMAIL).one()
        return UserDevice.query.filter_by(user_id=user.id, device_group=group).one().id


def test_the_first_swap_is_self_service(app):
    client = signed_in(app)
    signed_in(app, device="machine-2")
    body = client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-1')}").get_json()
    assert body["swaps_used"] == 1 and body["swaps_allowed"] == 1
    # the freed slot really is free
    assert signed_in(app, device="machine-3") is not None


def test_a_second_swap_is_refused_and_offers_the_admin_route(app):
    client = signed_in(app)
    signed_in(app, device="machine-2")
    client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-1')}")
    signed_in(app, device="machine-3")

    refused = client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-2')}")
    assert refused.status_code == 403
    assert refused.get_json()["error"] == "device_swap_limit_reached"

    asked = client.post("/api/v1/auth/devices/swap-requests", json={"reason": "new phone"})
    assert asked.status_code == 201
    assert asked.get_json()["request"]["status"] == "pending"
    # asking twice joins the same queue rather than filling it
    again = client.post("/api/v1/auth/devices/swap-requests", json={"reason": "again"})
    assert again.status_code == 200
    with app.app_context():
        assert DeviceSwapRequest.query.count() == 1


def test_asking_while_a_swap_is_still_available_is_refused(app):
    client = signed_in(app)
    asked = client.post("/api/v1/auth/devices/swap-requests", json={})
    assert asked.status_code == 409
    assert asked.get_json()["error"] == "swap_still_available"


def test_an_admin_approval_buys_exactly_one_more_swap(app):
    client = signed_in(app)
    signed_in(app, device="machine-2")
    client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-1')}")
    signed_in(app, device="machine-3")
    client.post("/api/v1/auth/devices/swap-requests", json={"reason": "stolen laptop"})

    admin = signed_in(app, email="swap-admin@example.test", device="admin-machine")
    pending = admin.get("/api/v1/admin/device-swap-requests").get_json()["requests"]
    assert len(pending) == 1
    decided = admin.post(f"/api/v1/admin/device-swap-requests/{pending[0]['id']}/approve")
    assert decided.status_code == 200
    assert decided.get_json()["request"]["status"] == "approved"
    # deciding twice is refused rather than granting a second allowance
    assert admin.post(f"/api/v1/admin/device-swap-requests/{pending[0]['id']}/approve").status_code == 409

    second = client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-2')}")
    assert second.status_code == 200
    assert second.get_json()["swaps_used"] == 2 and second.get_json()["swaps_allowed"] == 2
    # and that is the end of it until the window turns over
    signed_in(app, device="machine-4")
    assert client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-3')}").status_code == 403


def test_a_rejection_grants_nothing(app):
    client = signed_in(app)
    signed_in(app, device="machine-2")
    client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-1')}")
    signed_in(app, device="machine-3")
    client.post("/api/v1/auth/devices/swap-requests", json={})

    admin = signed_in(app, email="swap-admin@example.test", device="admin-machine")
    rid = admin.get("/api/v1/admin/device-swap-requests").get_json()["requests"][0]["id"]
    admin.post(f"/api/v1/admin/device-swap-requests/{rid}/reject")
    assert client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-2')}").status_code == 403


def test_the_allowance_returns_once_the_window_passes(app):
    """The window opens at the first swap, so a learner who never swaps never burns one."""
    client = signed_in(app)
    signed_in(app, device="machine-2")
    client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-1')}")
    signed_in(app, device="machine-3")
    assert client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-2')}").status_code == 403

    with app.app_context():
        user = User.query.filter_by(email=EMAIL).one()
        user.device_swap_window_start = datetime.now(timezone.utc) - timedelta(days=181)
        db.session.commit()
    assert client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-2')}").status_code == 200


def test_the_window_length_is_an_admin_setting(app):
    with app.app_context():
        db.session.add(Setting(key="device_swap_days", value="30"))
        db.session.commit()
    client = signed_in(app)
    signed_in(app, device="machine-2")
    client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-1')}")
    signed_in(app, device="machine-3")
    assert client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-2')}").status_code == 403

    with app.app_context():
        user = User.query.filter_by(email=EMAIL).one()
        user.device_swap_window_start = datetime.now(timezone.utc) - timedelta(days=31)
        db.session.commit()
    assert client.delete(f"/api/v1/auth/devices/{device_id(app, 'machine-2')}").status_code == 200
