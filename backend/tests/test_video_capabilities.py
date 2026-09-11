"""GET /video/capabilities answers exactly what the mint would, before the mint.

Every row here mirrors docs/PROTECTION_MATRIX.md. If the two ever disagree the page
would promise one thing and the server do another.
"""
import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Setting

WIN_CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
WIN_EDGE = WIN_CHROME + " Edg/128.0"
MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36"
ANDROID_FIREFOX = "Mozilla/5.0 (Android 14; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0"
INSTAGRAM = ANDROID_CHROME + " Instagram 300.0"
LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
APP = "BaytaraApp/1 Android"


@pytest.fixture
def app(tmp_path):
    config = type("CapabilitiesConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'caps.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def ask(app, ua):
    r = app.test_client().get("/api/v1/video/capabilities", headers={"User-Agent": ua})
    assert r.status_code == 200
    return r.get_json()


def set_policy(app, key, on):
    with app.app_context():
        row = db.session.get(Setting, key) or Setting(key=key)
        row.value = "1" if on else "0"
        db.session.add(row)
        db.session.commit()


def test_default_policy_matches_the_mint(app):
    # Refused regardless of the switch
    assert ask(app, MAC_CHROME)["blocked"] == "mac_needs_safari"
    assert ask(app, INSTAGRAM)["blocked"] == "unsupported_browser"
    # Allowed by default, but not hardware-protected: the nudge case
    for ua in (WIN_CHROME, ANDROID_FIREFOX, LINUX):
        answer = ask(app, ua)
        assert answer["blocked"] is None, ua
        assert answer["protected"] is False, ua
    # Hardware DRM
    for ua in (WIN_EDGE, MAC_SAFARI, IPHONE, ANDROID_CHROME, APP):
        answer = ask(app, ua)
        assert answer["blocked"] is None, ua
        assert answer["protected"] is True, ua


def test_strict_policy_blocks_software_drm_browsers(app):
    set_policy(app, "strict_browser_policy", True)
    for ua in (WIN_CHROME, ANDROID_FIREFOX, LINUX):
        assert ask(app, ua)["blocked"] == "browser_not_supported", ua
    for ua in (WIN_EDGE, MAC_SAFARI, IPHONE, ANDROID_CHROME, APP):
        assert ask(app, ua)["blocked"] is None, ua
    # the earlier refusals keep their own, more useful, reason
    assert ask(app, MAC_CHROME)["blocked"] == "mac_needs_safari"


def test_mobile_requires_app_wins_on_a_phone_browser(app):
    set_policy(app, "mobile_requires_app", True)
    assert ask(app, ANDROID_CHROME)["blocked"] == "app_required"
    assert ask(app, IPHONE)["blocked"] == "app_required"
    assert ask(app, APP)["blocked"] is None
    assert ask(app, WIN_EDGE)["blocked"] is None


def test_platform_hint(app):
    assert ask(app, MAC_CHROME)["platform"] == "mac"
    assert ask(app, WIN_CHROME)["platform"] == "windows"
    assert ask(app, ANDROID_FIREFOX)["platform"] == "android"
    assert ask(app, IPHONE)["platform"] == "ios"
    assert ask(app, LINUX)["platform"] == "linux"
