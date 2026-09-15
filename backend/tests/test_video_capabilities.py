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
    # Refused regardless of the strict switch. With no FairPlay certificate it is Safari
    # that cannot play on a Mac, not Chrome.
    assert ask(app, MAC_SAFARI)["blocked"] == "mac_needs_chrome"
    assert ask(app, INSTAGRAM)["blocked"] == "unsupported_browser"
    # Allowed by default, but not hardware-protected: the nudge case
    for ua in (WIN_CHROME, ANDROID_FIREFOX, LINUX, MAC_CHROME):
        answer = ask(app, ua)
        assert answer["blocked"] is None, ua
        assert answer["protected"] is False, ua
    # Hardware DRM, without a FairPlay certificate: Apple is not on this list.
    for ua in (WIN_EDGE, ANDROID_CHROME, APP):
        answer = ask(app, ua)
        assert answer["blocked"] is None, ua
        assert answer["protected"] is True, ua


def test_strict_policy_blocks_software_drm_browsers(app):
    set_policy(app, "strict_browser_policy", True)
    # Without FairPlay this now includes every Mac browser and iOS, which is the honest
    # reading of "hardware DRM only" and the reason the certificate matters.
    for ua in (WIN_CHROME, ANDROID_FIREFOX, LINUX, MAC_CHROME, IPHONE):
        assert ask(app, ua)["blocked"] == "browser_not_supported", ua
    for ua in (WIN_EDGE, ANDROID_CHROME, APP):
        assert ask(app, ua)["blocked"] is None, ua
    # the earlier refusals keep their own, more useful, reason
    assert ask(app, MAC_SAFARI)["blocked"] == "mac_needs_chrome"


def test_mobile_requires_app_wins_on_a_phone_browser(app):
    set_policy(app, "mobile_requires_app", True)
    assert ask(app, ANDROID_CHROME)["blocked"] == "app_required"
    assert ask(app, IPHONE)["blocked"] == "app_required"
    assert ask(app, IPHONE)["recommend"] == "app"
    assert ask(app, APP)["blocked"] is None
    assert ask(app, WIN_EDGE)["blocked"] is None


def test_without_fairplay_safari_is_the_refused_mac_browser(app):
    """VdoCipher's player refuses macOS Safari without a certificate and tells the viewer
    to open Chrome. Refusing Chrome and naming Safari, as we used to, is a closed loop:
    the viewer is sent between two browsers and can never watch."""
    assert ask(app, MAC_SAFARI)["blocked"] == "mac_needs_chrome"
    assert ask(app, MAC_SAFARI)["recommend"] == "chrome"
    # and the browsers that actually play over Widevine are let through
    assert ask(app, MAC_CHROME)["blocked"] is None
    assert ask(app, MAC_CHROME)["recommend"] == "chrome"


def test_with_fairplay_the_mac_rule_inverts(app):
    set_policy(app, "fairplay_enabled", True)
    assert ask(app, MAC_SAFARI)["blocked"] is None
    assert ask(app, MAC_CHROME)["blocked"] == "mac_needs_safari"
    assert ask(app, MAC_CHROME)["recommend"] == "safari"


def test_apple_is_only_capture_protected_once_the_certificate_exists(app):
    """Without it, iOS gets proprietary encryption rather than DRM, and macOS Safari does
    not play at all -- so neither is protected. Confirmed by VdoCipher 2026-09-15."""
    assert ask(app, IPHONE)["protected"] is False
    assert ask(app, MAC_SAFARI)["protected"] is False

    set_policy(app, "fairplay_enabled", True)
    assert ask(app, IPHONE)["protected"] is True
    assert ask(app, MAC_SAFARI)["protected"] is True
    assert ask(app, MAC_CHROME)["protected"] is False   # Widevine in software, either way


def test_android_and_the_app_never_depended_on_fairplay(app):
    for ua in (ANDROID_CHROME, APP):
        assert ask(app, ua)["protected"] is True, ua
    set_policy(app, "fairplay_enabled", True)
    for ua in (ANDROID_CHROME, APP):
        assert ask(app, ua)["protected"] is True, ua


def test_platform_hint(app):
    assert ask(app, MAC_CHROME)["platform"] == "mac"
    assert ask(app, MAC_SAFARI)["platform"] == "mac"
    assert ask(app, WIN_CHROME)["platform"] == "windows"
    assert ask(app, ANDROID_FIREFOX)["platform"] == "android"
    assert ask(app, IPHONE)["platform"] == "ios"
    assert ask(app, LINUX)["platform"] == "linux"


def test_no_browser_is_named_when_none_would_be_allowed(app):
    """The loop this prevents: Safari says "use Chrome", the strict rule then refuses
    Chrome, and its copy used to say "use Safari on Apple devices"."""
    set_policy(app, "strict_browser_policy", True)
    for ua in (MAC_SAFARI, MAC_CHROME):
        answer = ask(app, ua)
        assert answer["blocked"] is not None, ua
        assert answer["recommend"] is None, ua       # honest: nothing here works
    # Windows still has somewhere to go, and the app is the answer on a phone
    assert ask(app, WIN_CHROME)["recommend"] == "edge"
    set_policy(app, "mobile_requires_app", True)
    assert ask(app, IPHONE)["recommend"] == "app"


def test_a_mac_is_pointed_at_chrome_only_when_chrome_would_be_allowed(app):
    # strict off: Chrome plays over Widevine, so naming it is honest
    assert ask(app, MAC_SAFARI)["recommend"] == "chrome"
    # strict on: it would be refused, so name nothing
    set_policy(app, "strict_browser_policy", True)
    assert ask(app, MAC_SAFARI)["recommend"] is None
