"""Fawaterak payment gateway (hosted pay-link).

Checkout: create an invoice link and redirect the user. The verified webhook is the
source of truth for 'paid' -> grant access atomically. No card data ever touches us.

Auth = OAuth2 client_credentials: client_id + client_secret -> /oauth/token -> access
token, used as Bearer on the REST API. (Legacy static API key still supported as a
fallback.) The webhook HMAC uses the HASH API key.

Config is admin-managed via Setting keys (applied live, no restart):
  secret_fawaterk_client_id     -> OAuth client id
  secret_fawaterk_client_secret -> OAuth client secret
  secret_fawaterk_vendor        -> HASH API key (HMAC webhook verification)
  secret_fawaterk_api           -> legacy static Bearer key (optional fallback)
  fawaterk_mode                 -> "production" (app.fawaterk.com) | "staging" (default)
Matching FAWATERK_* env vars are fallbacks.
"""
import os
import time
import hmac
import json
import hashlib
import urllib.parse
import urllib.request
import urllib.error

STAGING = "https://staging.fawaterk.com/api/v2"
PRODUCTION = "https://app.fawaterk.com/api/v2"

# cached OAuth access token: {"token": str, "exp": epoch_seconds}
_TOKEN_CACHE = {}


class FawaterkError(Exception):
    pass


def _setting(key):
    try:
        from ..models import Setting
        from ..extensions import db
        s = db.session.get(Setting, key)
        return s.value if s and s.value else None
    except Exception:  # noqa: BLE001 — outside app context / table missing
        return None


def _client_id():
    return _setting("secret_fawaterk_client_id") or os.environ.get("FAWATERK_CLIENT_ID")


def _client_secret():
    return _setting("secret_fawaterk_client_secret") or os.environ.get("FAWATERK_CLIENT_SECRET")


def _api_key():
    return _setting("secret_fawaterk_api") or os.environ.get("FAWATERK_API_KEY")


def _vendor_key():
    return _setting("secret_fawaterk_vendor") or os.environ.get("FAWATERK_VENDOR_KEY")


def _base():
    mode = _setting("fawaterk_mode") or os.environ.get("FAWATERK_MODE") or "staging"
    return PRODUCTION if mode == "production" else STAGING


def _oauth_base():
    return _base().rsplit("/api/", 1)[0]  # strip /api/v2 -> host root for /oauth/token


def configured():
    return bool(_vendor_key() and ((_client_id() and _client_secret()) or _api_key()))


def _access_token():
    """OAuth2 client_credentials access token (cached until ~60s before expiry)."""
    cid, csec = _client_id(), _client_secret()
    if not (cid and csec):
        if _api_key():
            return _api_key()  # legacy static key
        raise FawaterkError("no_credentials")
    cached = _TOKEN_CACHE.get(_oauth_base())
    if cached and cached["exp"] - 60 > time.time():
        return cached["token"]
    data = urllib.parse.urlencode({
        "grant_type": "client_credentials", "client_id": cid, "client_secret": csec,
    }).encode()
    req = urllib.request.Request(_oauth_base() + "/oauth/token", data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            tok = json.load(r)
    except urllib.error.HTTPError as e:
        raise FawaterkError(f"oauth_http_{e.code}:{e.read().decode('utf-8','ignore')[:200]}")
    except Exception as e:  # noqa: BLE001
        raise FawaterkError(f"oauth_unreachable:{e}")
    access = tok.get("access_token")
    if not access:
        raise FawaterkError(f"oauth_bad_response:{json.dumps(tok)[:200]}")
    _TOKEN_CACHE[_oauth_base()] = {"token": access, "exp": time.time() + int(tok.get("expires_in", 3600))}
    return access


def _post(path, body):
    token = _access_token()
    req = urllib.request.Request(_base() + path, data=json.dumps(body).encode(), method="POST")
    req.add_header("Authorization", "Bearer " + token)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        raise FawaterkError(f"http_{e.code}:{detail}")
    except Exception as e:  # noqa: BLE001
        raise FawaterkError(f"unreachable:{e}")


def create_invoice_link(amount, currency, customer, items, payload, redirect_urls):
    """Create a hosted invoice; returns {url, invoice_id, invoice_key}.
    customer: {first_name,last_name,email,phone}; items: [{name,price,quantity}];
    payload: dict tracked back on the webhook; redirect_urls: {successUrl,failUrl,pendingUrl,webhookUrl}."""
    body = {
        "cartTotal": float(amount),
        "currency": currency,
        "customer": customer,
        "cartItems": items,
        "payLoad": payload,
        "redirectionUrls": redirect_urls,
    }
    data = _post("/createInvoiceLink", body)
    d = data.get("data") or {}
    if data.get("status") != "success" or not d.get("url"):
        raise FawaterkError(f"bad_response:{json.dumps(data)[:200]}")
    return {"url": d["url"], "invoice_id": str(d.get("invoiceId") or ""), "invoice_key": d.get("invoiceKey") or ""}


def verify_webhook(payload):
    """Verify the webhook HMAC-SHA256 hashKey. Returns a normalized dict:
    {ok, status: paid|failed|expired|refunded, invoice_id, invoice_key, payment_method,
     reference_number, pay_load}. ok=False if the signature is missing/invalid."""
    vk = _vendor_key()
    if not vk:
        return {"ok": False, "reason": "no_vendor_key"}
    got = payload.get("hashKey") or ""

    # Paid/refund payloads carry invoice_id + invoice_key; expired/failed carry referenceId.
    if payload.get("invoice_id") is not None and payload.get("invoice_key") is not None:
        method = payload.get("payment_method") or ""
        msg = f"InvoiceId={payload['invoice_id']}&InvoiceKey={payload['invoice_key']}&PaymentMethod={method}"
        status = (payload.get("invoice_status") or "").lower() or "paid"
        norm = {
            "status": "paid" if status == "paid" else ("refunded" if status == "refund" else status),
            "invoice_id": str(payload.get("invoice_id")),
            "invoice_key": payload.get("invoice_key"),
            "payment_method": method,
            "reference_number": str(payload.get("referenceNumber") or ""),
            "pay_load": payload.get("pay_load"),
        }
    else:
        method = payload.get("paymentMethod") or ""
        ref = payload.get("referenceId")
        msg = f"referenceId={ref}&PaymentMethod={method}"
        st = (payload.get("status") or "").lower()
        norm = {
            "status": "expired" if st in ("expired", "canceled", "cancelled") else "failed",
            "invoice_id": str(payload.get("transactionId") or ""),
            "invoice_key": payload.get("transactionKey"),
            "payment_method": method,
            "reference_number": str(ref or ""),
            "pay_load": payload.get("pay_load"),
        }

    expected = hmac.new(vk.encode(), msg.encode(), hashlib.sha256).hexdigest()
    norm["ok"] = hmac.compare_digest(expected, got)
    return norm
