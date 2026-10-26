"""Kashier payment gateway, through the hosted payment page (HPP).

Checkout is a signed link to checkout.kashier.io: no API call, no Secret key. The link
carries an order hash, HMAC-SHA256 over "/?payment={mid}.{order}.{amount}.{currency}"
with the Payment API key, exactly as Kashier's own demo builds it
(Kashier-payments/Php-Checkout-Demo, backend.php). Kashier answers two ways, both signed
with the same key and both settled through one idempotent path:

  * the browser redirect back (hppCallback.php: every query param except `signature`
    and `mode`, in the order received, raw, joined "k=v&k=v");
  * the server-to-server webhook (`x-kashier-signature` over the fields named in
    data.signatureKeys). Kashier's own SDKs disagree on whether those are sorted, so
    both orders are accepted.

Why not the payment-sessions API this file used first: it needs the Secret key, and the
one issued for this account is refused by both Kashier environments, while the Merchant
ID and Payment API key work. The same HPP design runs in production in another of our
systems (docs: /projects/monitor_portal/docs/kashier-integration.md).

Keys, admin-managed as Setting rows so they can be pasted in without a deploy:
  secret_kashier_merchant_id -> merchantId (MID-xxxx-xxx)
  secret_kashier_api_key     -> Payment API key: signs the link, verifies both answers
  secret_kashier_secret      -> stored, not needed by this flow
  kashier_mode               -> "live" | "test" (default)
Matching KASHIER_* env vars are fallbacks.
"""
import hashlib
import hmac
import os
import urllib.parse


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


def configured():
    """Whether a checkout link can be signed right now."""
    return bool(_merchant_id() and _api_key())


def missing_keys():
    """Which credentials are still blank -- what the admin screen has to say out loud."""
    return [name for name, value in (
        ("merchant_id", _merchant_id()),
        ("api_key", _api_key()),
    ) if not value]


CHECKOUT = "https://checkout.kashier.io"
ORDER_PREFIX = "BT-"
# Params Kashier adds to the redirect that are not part of the signed string.
_RETURN_UNSIGNED = ("signature", "mode")


def order_id_for(payment_id):
    """Our order id on Kashier. Prefixed so another system on the same merchant account
    can never collide with ours, and so an id that is not ours is recognisably not ours."""
    return f"{ORDER_PREFIX}{payment_id}"


def payment_id_from(order_id):
    """The Payment id inside one of our order ids, or None."""
    value = str(order_id or "")
    if value.startswith(ORDER_PREFIX) and value[len(ORDER_PREFIX):].isdigit():
        return int(value[len(ORDER_PREFIX):])
    return None


def _hmac(message):
    return hmac.new((_api_key() or "").encode(), message.encode(), hashlib.sha256).hexdigest()


def checkout_url(amount, currency, order_id, redirect_url, webhook_url, language="ar"):
    """The hosted-checkout link. Signed here; nothing is sent to Kashier until the buyer
    opens it. The amount is formatted once and used for both the hash and the query, which
    is the only way to keep the two byte-identical."""
    if not configured():
        raise KashierError("not_configured")
    amount_str = f"{float(amount):.2f}"
    params = {
        "merchantId": _merchant_id(),
        "orderId": order_id,
        "amount": amount_str,
        "currency": currency,
        "hash": _hmac(f"/?payment={_merchant_id()}.{order_id}.{amount_str}.{currency}"),
        "mode": mode(),
        "merchantRedirect": redirect_url,
        "serverWebhook": webhook_url,
        "allowedMethods": "card,wallet",
        "display": "ar" if language == "ar" else "en",
    }
    # "/?" rather than "?": WhatsApp's link detector on iOS cut a host-only URL at the
    # "?" in the other system, and the hash covers a fixed string, so the slash is free.
    return CHECKOUT + "/?" + urllib.parse.urlencode(params)


def verify_return(query_pairs):
    """Verify the browser redirect back from the hosted page.

    `query_pairs` must be in the order received (request.args.items(multi=True)): the
    signed string is the params joined in that order. Returns the same normalized dict as
    the webhook, with ok=True only when the signature checks out.
    """
    sent, parts, data = "", [], {}
    for key, value in query_pairs:
        if key == "signature":
            sent = value
            continue
        data[key] = value
        if key in _RETURN_UNSIGNED:
            continue
        parts.append(f"{key}={value}")
    result = _normalize({
        "status": data.get("paymentStatus"),
        "amount": data.get("amount"),
        "currency": data.get("currency"),
        "merchantOrderId": data.get("merchantOrderId"),
        "kashierOrderId": data.get("orderId"),
        "transactionId": data.get("transactionId"),
        "method": data.get("cardBrand") or data.get("paymentMethod") or "",
    })
    result["ok"] = bool(_api_key() and sent and parts) and hmac.compare_digest(_hmac("&".join(parts)), sent)
    if not result["ok"]:
        result["reason"] = "bad_signature"
    return result


def _signature_payload(data, keys):
    """The string Kashier signed: the named fields, values URL-encoded, joined as a query
    string, in the order given."""
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
    result = _normalize(data, event=(payload or {}).get("event"))
    # Kashier's PHP SDK sorts the keys and its Python SDK keeps them as given; accept
    # either rather than bet on which one built this account's webhooks.
    result["ok"] = any(
        hmac.compare_digest(_hmac(_signature_payload(data, order)), str(header_signature))
        for order in (sorted(keys), list(keys))
    )
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
    elif status in ("SUCCESS", "CAPTURED"):
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
