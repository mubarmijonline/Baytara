"""Video DRM provider abstraction (VdoCipher).

The backend is the sole authority for access: it validates enrollment, then asks the
provider to mint a short-lived OTP + playbackInfo. No raw/public video URLs anywhere.
Swap `provider` for another vendor by assigning a different object exposing issue_otp().
"""
import ipaddress
import os
import json
import urllib.request
import urllib.error

OTP_URL = "https://dev.vdocipher.com/api/videos/%s/otp"


class VideoProviderError(Exception):
    pass


def is_public_ipv4(value):
    """True for a routable IPv4 address -- the only kind an `ipGeo` rule can name."""
    try:
        addr = ipaddress.ip_address(value)
    except ValueError:
        return False
    return addr.version == 4 and addr.is_global


class VdoCipherProvider:
    def __init__(self, secret=None):
        self._secret = secret

    @property
    def secret(self):
        # priority: explicit > DB setting (admin-managed, applies live) > env
        if self._secret:
            return self._secret
        try:
            from ..models import Setting
            from ..extensions import db
            s = db.session.get(Setting, "secret_vdocipher")
            if s and s.value:
                return s.value
        except Exception:  # noqa: BLE001 — outside app context / table missing
            pass
        return os.environ.get("VDOCIPHER_API_SECRET")

    def issue_otp(self, video_id, annotate=None, ttl=300, ip_address=None, whitelist_href=None):
        """Mint a single-use OTP for one viewer.

        `ip_address` pins the OTP to the requesting address (`ipGeo`), which VdoCipher
        "strongly recommends": an OTP copied out of the page is then useless anywhere
        else. Only a public IPv4 is sent -- the rule set accepts IPv4 only, and a
        private/loopback address (local dev behind nginx) would pin the OTP to an
        address the licence server never sees, refusing playback that was just allowed.

        `whitelist_href` restricts playback to pages whose referrer hostname matches it.
        The native apps send no referrer, so the caller leaves it None for them.
        """
        if not self.secret:
            raise VideoProviderError("no_api_key")
        payload = {"ttl": ttl}
        if annotate:
            payload["annotate"] = json.dumps(annotate)
        if ip_address and is_public_ipv4(ip_address):
            payload["ipGeo"] = {"allow": [ip_address]}
        if whitelist_href:
            payload["whitelisthref"] = whitelist_href
        req = urllib.request.Request(OTP_URL % video_id, data=json.dumps(payload).encode(), method="POST")
        req.add_header("Authorization", "Apisecret " + self.secret)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            raise VideoProviderError(f"vdocipher_http_{e.code}")
        except Exception:
            raise VideoProviderError("vdocipher_unreachable")
        if not data.get("otp") or not data.get("playbackInfo"):
            raise VideoProviderError("vdocipher_bad_response")
        return {"otp": data["otp"], "playbackInfo": data["playbackInfo"]}


# module-level provider — reassign to swap DRM vendor
provider = VdoCipherProvider()


def watermark_for(user, ip_address="", session_ref=""):
    """Dynamic watermark annotation carrying viewer identity (anti-piracy).
    Contract البند2: email + phone floating over the video."""
    if user is None:
        return [
            {"type": "rtext", "text": "Baytara", "alpha": "0.45",
             "color": "0xFFFFFF", "size": "15", "interval": "6000"},
        ]
    session_label = session_ref[:8] if session_ref else "-"
    # The account id is the one field that survives a name change, an email change and a
    # new phone number. A leaked recording must still point at exactly one row.
    return [
        {"type": "rtext", "text": f"{user.name} · {user.email}", "alpha": "0.58",
         "color": "0xFFFFFF", "size": "15", "interval": "5000"},
        {"type": "rtext", "text": f"{user.phone} · ID {user.id} · {ip_address} · Session {session_label}",
         "alpha": "0.52", "color": "0xFFFFFF", "size": "13", "interval": "7000"},
    ]
