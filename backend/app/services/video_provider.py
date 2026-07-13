"""Video DRM provider abstraction (VdoCipher).

The backend is the sole authority for access: it validates enrollment, then asks the
provider to mint a short-lived OTP + playbackInfo. No raw/public video URLs anywhere.
Swap `provider` for another vendor by assigning a different object exposing issue_otp().
"""
import os
import json
import urllib.request
import urllib.error

OTP_URL = "https://dev.vdocipher.com/api/videos/%s/otp"


class VideoProviderError(Exception):
    pass


class VdoCipherProvider:
    def __init__(self, secret=None):
        self._secret = secret

    @property
    def secret(self):
        # read lazily so the app boots without the key; only playback needs it
        return self._secret or os.environ.get("VDOCIPHER_API_SECRET")

    def issue_otp(self, video_id, annotate=None, ttl=300):
        if not self.secret:
            raise VideoProviderError("no_api_key")
        payload = {"ttl": ttl}
        if annotate:
            payload["annotate"] = json.dumps(annotate)
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


def watermark_for(user):
    """Dynamic watermark annotation carrying viewer identity (anti-piracy)."""
    return [
        {"type": "rtext", "text": f"{user.name} · {user.email}", "alpha": "0.55",
         "color": "0xFFFFFF", "size": "15", "interval": "5000"},
        {"type": "rtext", "text": f"ID {user.id}", "alpha": "0.45",
         "color": "0xFFFFFF", "size": "12", "interval": "8000"},
    ]
