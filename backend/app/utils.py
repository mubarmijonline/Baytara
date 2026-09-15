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


# Browsers where the platform actually enforces hardware DRM on the picture. Everything
# else decodes in software, so a desktop recorder captures the lesson at full quality.
def protected_browser(ua=None):
    """True when this client's DRM is hardware-enforced (picture cannot be captured)."""
    ua = _ua(ua)
    if APP_UA_MARKER in ua:
        return True                                  # the app shell enforces its own
    if any(m in ua for m in _IOS_MARKERS):
        # Every iOS browser is WebKit, but WebKit alone is not DRM. Without a FairPlay
        # certificate VdoCipher serves iOS its own encryption, which stops a downloader
        # and nothing else -- confirmed by VdoCipher, 2026-09-15.
        return fairplay_enabled()
    if "Android" in ua:
        # Widevine L1 on Chrome / Samsung Internet; the level itself cannot be checked here
        return ("Chrome" in ua or "SamsungBrowser" in ua) and "Firefox" not in ua
    if any(m in ua for m in _MAC_MARKERS):
        # Safari is the only macOS browser that can be capture-protected, and only once
        # the certificate is installed. Chrome and Firefox decode Widevine in software.
        return fairplay_enabled() and not mac_without_safari(ua)
    if "Windows" in ua:
        # UNVERIFIED. VdoCipher describe Widevine as their default desktop integration and
        # do not mention PlayReady; if Edge is served Widevine like every other desktop
        # browser, it is software DRM and this should be False. Asked, not yet answered.
        return "Edg/" in ua
    return False                                     # Linux, ChromeOS, unknown -> software DRM


def platform_class(ua=None):
    """Coarse platform for guidance copy ("open this in Safari" vs "in Edge")."""
    ua = _ua(ua)
    if any(m in ua for m in _IOS_MARKERS):
        return "ios"
    if "Android" in ua:
        return "android"
    if any(m in ua for m in _MAC_MARKERS):
        return "mac"
    if "Windows" in ua:
        return "windows"
    if "Linux" in ua or "X11" in ua:
        return "linux"
    return "other"


def mac_safari(ua=None):
    """True for macOS in Safari (iOS excluded -- it has its own rules)."""
    ua = _ua(ua)
    if any(m in ua for m in _IOS_MARKERS):
        return False
    return any(m in ua for m in _MAC_MARKERS) and not mac_without_safari(ua)


def fairplay_enabled():
    """Admin switch: an Apple FairPlay certificate is installed on the VdoCipher account.

    Off by default, because a certificate is granted by Apple to the content owner and has
    to be applied for -- VdoCipher cannot supply it (docs/VDOCIPHER_ACCOUNT_SETUP.md).

    It decides what Apple platforms can do, and the two states are near opposites:

      off  macOS Safari will not play at all -- VdoCipher's player tells the viewer to
           open Chrome -- while Chrome and Firefox play over Widevine. iOS plays with
           proprietary encryption that is not DRM, so nothing is capture-protected.
      on   Safari plays over FairPlay and is the only capture-protected browser on macOS;
           iOS becomes protected too. Chrome and Firefox keep working over Widevine.

    Getting this backwards is not a degraded experience, it is a closed loop: sending a Mac
    user to Safari without a certificate lands them on a player that sends them back.
    """
    from .models import Setting
    from .extensions import db
    setting = db.session.get(Setting, "fairplay_enabled")
    value = setting.value if setting else None
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def strict_browser_policy():
    """Admin switch: serve protected video only to hardware-DRM browsers (default off)."""
    from .models import Setting
    from .extensions import db
    setting = db.session.get(Setting, "strict_browser_policy")
    value = setting.value if setting else None
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


def mobile_requires_app():
    """Admin switch: refuse protected video to mobile browsers, serving the app only.

    Default off — a phone browser can still watch, it simply cannot stop a recording
    from taking the audio. Turn it on once the apps are published, and mobile web
    loses protected playback entirely.
    """
    from .models import Setting
    from .extensions import db
    setting = db.session.get(Setting, "mobile_requires_app")
    value = setting.value if setting else None
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")
    return bool(value)


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
