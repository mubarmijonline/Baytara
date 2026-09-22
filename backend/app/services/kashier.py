"""Kashier payment gateway (hosted checkout via a payment session).

Checkout: POST a payment session, redirect the buyer to the `sessionUrl` it returns.
The signed webhook is the source of truth for "paid"; the browser's return from the
hosted page is only a hint, and the result is re-read from Kashier before anything is
granted. No card data ever touches us.

Three keys, all from the Kashier dashboard and all admin-managed as Setting rows so
they can be pasted in without a deploy:
  secret_kashier_merchant_id -> merchantId (MID-xxxx-xxx)
  secret_kashier_secret      -> Secret key, sent as the Authorization header
  secret_kashier_api_key     -> Payment API key, which signs the webhook
  kashier_mode               -> "live" | "test" (default)
Matching KASHIER_* env vars are fallbacks.

Signature verification follows Kashier's rule exactly: the payload names the fields it
signed in data.signatureKeys, those are sorted, their values URL-encoded (values only),
joined as a query string, and HMAC-SHA256'd with the Payment API key. Trusting our own
idea of which fields are signed would break the day Kashier adds one.

Reference: https://developers.kashier.io/docs/accept-payments/payment-sessions
           https://developers.kashier.io/docs/webhooks
"""
import hashlib
import hmac
import json
import os
import urllib.error
import urllib.parse
import urllib.request

TEST = "https://test-api.kashier.io"
LIVE = "https://api.kashier.io"


class KashierError(Exception):
    pass


def _setting(key):
    try:
        from ..extensions import db
        from ..models import Setting
        row = db.session.get(Setting, key)
        return row.value if row and row.value else None
    except Exception:  # noqa: BLE001 — outside app context / table missing
        return None


def _merchant_id():
    return _setting("secret_kashier_merchant_id") or os.environ.get("KASHIER_MERCHANT_ID")


def _secret_key():
    return _setting("secret_kashier_secret") or os.environ.get("KASHIER_SECRET_KEY")


def _api_key():
    return _setting("secret_kashier_api_key") or os.environ.get("KASHIER_API_KEY")


def mode():
    return _setting("kashier_mode") or os.environ.get("KASHIER_MODE") or "test"


def _base():
    return LIVE if mode() == "live" else TEST


def configured():
    """Whether a checkout could be created right now."""
    return bool(_merchant_id() and _secret_key() and _api_key())


def missing_keys():
    """Which credentials are still blank -- what the admin screen has to say out loud."""
    return [name for name, value in (
        ("merchant_id", _merchant_id()),
        ("secret_key", _secret_key()),
        ("api_key", _api_key()),
    ) if not value]


def _request(method, path, body=None):
    url = _base() + path
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", _secret_key() or "")
    req.add_header("api-key", _api_key() or "")
    req.add_header("Accept", "application/json")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        raise KashierError(f"http_{exc.code}:{exc.read().decode('utf-8', 'ignore')[:300]}")
    except Exception as exc:  # noqa: BLE001
        raise KashierError(f"unreachable:{exc}")


def create_session(amount, currency, order_reference, customer, description,
                   redirect_url, webhook_url, failure_url=None, language="ar"):
    """Create a hosted checkout session.

    `order_reference` must be unique per merchant -- ours is the Payment row's id, which
    is also how the webhook finds its way back to the right purchase.
    Returns {url, session_id, order}.
    """
    if not configured():
        raise KashierError("not_configured")
    body = {
        "merchantId": _merchant_id(),
        "amount": f"{float(amount):.2f}",
        "currency": currency,
        "order": str(order_reference),
        "paymentType": "credit",
        "type": "one-time",
        "display": "ar" if language == "ar" else "en",
        "allowedMethods": "card,wallet",
        "description": (description or "")[:120],
        "merchantRedirect": redirect_url,
        "serverWebhook": webhook_url,
        "enable3DS": True,
    }
    if failure_url:
        body["failureRedirect"] = failure_url
    if customer.get("email"):
        body["customer"] = {"email": customer["email"], "reference": str(customer.get("reference") or "")}

    data = _request("POST", "/v3/payment/sessions", body)
    payload = data.get("response") or data.get("data") or data
    url = payload.get("sessionUrl") or data.get("sessionUrl")
    if not url:
        raise KashierError(f"bad_response:{json.dumps(data)[:300]}")
    return {
        "url": url,
        "session_id": str(payload.get("sessionId") or payload.get("_id") or ""),
        "order": str(order_reference),
    }


def read_payment(session_id):
    """Ask Kashier what actually happened. The browser coming back from the hosted page
    proves nothing; this and the webhook are the only things that do."""
    if not (configured() and session_id):
        raise KashierError("not_configured")
    data = _request("GET", f"/v3/payment/sessions/{urllib.parse.quote(str(session_id))}/payment")
    return _normalize(data.get("response") or data.get("data") or data)


def _signature_payload(data):
    """The exact string Kashier signed: the fields it names in signatureKeys, sorted,
    values URL-encoded, joined as a query string."""
    keys = sorted(data.get("signatureKeys") or [])
    return "&".join(
        f"{key}={urllib.parse.quote(str(data.get(key, '')), safe='')}" for key in keys
    )


def verify_webhook(payload, header_signature):
    """Verify `x-kashier-signature` over the webhook body.

    Returns a normalized dict with ok=True only when the signature checks out. Kashier's
    own documentation says never to treat anything else as settlement.
    """
    api_key = _api_key()
    if not api_key:
        return {"ok": False, "reason": "no_api_key"}
    data = (payload or {}).get("data") or {}
    keys = data.get("signatureKeys")
    if not keys or not header_signature:
        return {"ok": False, "reason": "unsigned"}
    expected = hmac.new(api_key.encode(), _signature_payload(data).encode(), hashlib.sha256).hexdigest()
    result = _normalize(data, event=(payload or {}).get("event"))
    result["ok"] = hmac.compare_digest(expected, str(header_signature))
    if not result["ok"]:
        result["reason"] = "bad_signature"
    return result


# Kashier reports the operation separately from its outcome: a SUCCESS on a refund is
# not money arriving. Map the pair, rather than reading `status` on its own.
_REFUND_EVENTS = {"refund", "partial_refund", "void", "reversal"}


def _normalize(data, event=None):
    event = (event or data.get("event") or "pay").lower()
    status = str(data.get("status") or "").upper()
    if event in _REFUND_EVENTS:
        state = "refunded" if status == "SUCCESS" else "failed"
    elif status == "SUCCESS":
        state = "paid"
    elif status == "PENDING":
        state = "pending"
    else:
        state = "failed"
    return {
        "status": state,
        "event": event,
        "amount": data.get("amount"),
        "currency": data.get("currency"),
        # Kashier echoes our `order` back under one of two names depending on the call;
        # keep both rather than guessing which, and let the caller try each.
        "merchant_order_id": str(data.get("merchantOrderId") or ""),
        "order_reference": str(data.get("orderReference") or ""),
        "kashier_order_id": str(data.get("kashierOrderId") or ""),
        "transaction_id": str(data.get("transactionId") or ""),
        "payment_method": data.get("method") or data.get("channel") or "",
    }
