"""Fawaterak payment gateway (hosted pay-link).

Checkout: create an invoice link and redirect the user. The verified webhook is the
source of truth for 'paid' -> grant access atomically. No card data ever touches us.

Config is admin-managed via Setting keys (applied live, no restart):
  secret_fawaterk_api    -> Bearer API key (createInvoiceLink)
  secret_fawaterk_vendor -> vendor key (HMAC webhook verification)
  fawaterk_mode          -> "production" (app.fawaterk.com) | "staging" (default)
Env vars FAWATERK_API_KEY / FAWATERK_VENDOR_KEY / FAWATERK_MODE are fallbacks.
"""
import os
import hmac
import json
import hashlib
import urllib.request
import urllib.error

STAGING = "https://staging.fawaterk.com/api/v2"
PRODUCTION = "https://app.fawaterk.com/api/v2"


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


def _api_key():
    return _setting("secret_fawaterk_api") or os.environ.get("FAWATERK_API_KEY")


def _vendor_key():
    return _setting("secret_fawaterk_vendor") or os.environ.get("FAWATERK_VENDOR_KEY")


def _base():
    mode = _setting("fawaterk_mode") or os.environ.get("FAWATERK_MODE") or "staging"
    return PRODUCTION if mode == "production" else STAGING


def configured():
    return bool(_api_key() and _vendor_key())


def _post(path, body):
    key = _api_key()
    if not key:
        raise FawaterkError("no_api_key")
    req = urllib.request.Request(_base() + path, data=json.dumps(body).encode(), method="POST")
    req.add_header("Authorization", "Bearer " + key)
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
