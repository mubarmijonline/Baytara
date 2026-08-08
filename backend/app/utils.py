import re
import uuid

from flask import request


def req_lang():
    """Locale for the current request: ?lang=ar|en, else Accept-Language, default 'ar'
    (contract البند1: Arabic default)."""
    lang = (request.args.get("lang") or "").lower()
    if lang in ("ar", "en"):
        return lang
    return "en" if (request.headers.get("Accept-Language") or "").lower().startswith("en") else "ar"


# Browsers on macOS that can be screen-recorded. Screen capture is only blocked by
# FairPlay DRM, which runs in Safari alone — Chrome/Firefox/Edge on a Mac can always
# be recorded, by any vendor. So playback on a Mac is refused outside Safari.
_MAC_MARKERS = ("Mac OS X", "Macintosh")
_IOS_MARKERS = ("iPhone", "iPad", "iPod")
_NON_SAFARI = ("Chrome", "Chromium", "Edg/", "OPR/", "Firefox")
# Social in-app webviews. They embed a stripped browser whose DRM support is absent or
# unreliable, and the host app can record the surface — no protected stream belongs there.
_INAPP_MARKERS = ("FBAN", "FBAV", "FB_IAB", "Instagram", "Line/", "MicroMessenger",
                  "TikTok", "Snapchat", "Twitter", "GSA/")


def _ua(ua=None):
    return ua if ua is not None else (request.headers.get("User-Agent") or "")


def mac_without_safari(ua=None):
    """True when the caller is on macOS in a browser that cannot block screen capture.

    iPhone/iPad are excluded: every iOS browser is WebKit, so FairPlay applies there
    even when the UA carries 'CriOS' or an iPad sends a desktop 'Macintosh' string.
    """
    ua = _ua(ua)
    if any(m in ua for m in _IOS_MARKERS):
        return False
    if not any(m in ua for m in _MAC_MARKERS):
        return False
    if any(b in ua for b in _NON_SAFARI):
        return True
    return "Safari" not in ua


# The Capacitor shell appends this to its User-Agent (mobile/capacitor.config.json).
# It is the only client on a phone that can defend the audio track, so protected video
# is reserved for it. A UA can be forged; the watermark and the OTP gate still apply.
APP_UA_MARKER = "BaytaraApp/"
_MOBILE_MARKERS = ("Android", "iPhone", "iPad", "iPod", "Mobile")


def baytara_app(ua=None):
    """True when the caller is the Baytara native shell rather than a mobile browser."""
    return APP_UA_MARKER in _ua(ua)


def mobile_browser(ua=None):
    """True for a phone/tablet browser (the app shell is excluded)."""
    ua = _ua(ua)
    if APP_UA_MARKER in ua:
        return False
    return any(marker in ua for marker in _MOBILE_MARKERS)


def inapp_webview(ua=None):
    """True for a social app's embedded browser (Instagram, Facebook, TikTok, ...)."""
    ua = _ua(ua)
    return any(marker in ua for marker in _INAPP_MARKERS)


def renewal_percent():
    """Global renewal fee as a percent of course price (admin-set, default 30%)."""
    from .models import Setting
    from .extensions import db
    s = db.session.get(Setting, "renewal_percent")
    try:
        v = float(s.value) if s and s.value is not None else 30.0
    except (TypeError, ValueError):
        v = 30.0
    return max(0.0, v)


def slugify(text, existing_check=None):
    """Slug from a title (keeps Arabic + word chars). Ensures uniqueness via existing_check(slug)->bool."""
    s = (text or "").strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^؀-ۿ\w-]", "", s)  # keep Arabic block + word chars + hyphen
    s = re.sub(r"-+", "-", s).strip("-")
    if not s:
        s = f"item-{uuid.uuid4().hex[:8]}"
    if existing_check is None:
        return s
    base, i = s, 2
    while existing_check(s):
        s = f"{base}-{i}"
        i += 1
    return s
