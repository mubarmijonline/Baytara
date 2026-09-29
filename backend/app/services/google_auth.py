"""Google Sign-In: verify the ID token a Google client hands us.

Only the ID token is verified — there is no OAuth code exchange, so the server
holds no Google client secret. google-auth checks the signature, expiry and
issuer against Google's published certs; the audience is checked here against an
allowlist so the web, Android and iOS OAuth clients can share one endpoint
(verify_oauth2_token accepts a single audience).
"""

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token


class GoogleAuthError(Exception):
    """Raised with a short machine-readable reason (never shown verbatim)."""


def verify_id_token(credential: str, client_ids):
    """Return the verified claims dict, or raise GoogleAuthError."""
    if not client_ids:
        raise GoogleAuthError("google_not_configured")
    try:
        claims = id_token.verify_oauth2_token(
            credential, google_requests.Request(), clock_skew_in_seconds=10
        )
    except Exception as exc:  # bad signature, expired, unreachable certs, malformed
        raise GoogleAuthError("invalid_token") from exc

    if claims.get("aud") not in client_ids:
        raise GoogleAuthError("audience_mismatch")
    if not claims.get("sub"):
        raise GoogleAuthError("sub_missing")
    if not claims.get("email"):
        raise GoogleAuthError("email_missing")
    # An unverified Google email must never be linked to an existing password
    # account — that would be account takeover by whoever controls the Google side.
    if claims.get("email_verified") not in (True, "true"):
        raise GoogleAuthError("email_unverified")
    return claims
