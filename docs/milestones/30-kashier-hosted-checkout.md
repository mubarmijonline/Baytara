# 30 - Kashier through the hosted payment page

**Status:** code live; payments not open yet. Waiting on Kashier test keys or live
activation (see "What happened with the keys").

## Why the change

The integration from milestone 16 used Kashier's payment-sessions API, which needs the
Secret key. The client's keys arrived on 2026-10-26 (Merchant ID `MID-52552-852`, a Payment
API key and a Secret key). Both Kashier environments refuse that Secret key
(`401 Invalid token` from `test-api` and `api`, on create and on read). The hosted payment
page needs only the Merchant ID and the Payment API key, and the same design already runs in
production in another of our systems (`/projects/monitor_portal/kashier.py`), so checkout
was moved to it.

## What it does now

- **Checkout:** a link to `checkout.kashier.io` signed with the Payment API key
  (`HMAC-SHA256(apiKey, "/?payment={mid}.{order}.{amount}.{currency}")`, from Kashier's
  `Php-Checkout-Demo`). Order ids are `BT-<payment id>`. The link carries
  `merchantRedirect` (our `/api/v1/payment/kashier/return`) and `serverWebhook`.
- **Two signed answers, one settle path:** the browser return (signature over every param
  except `signature` and `mode`, in order) and the webhook (`x-kashier-signature`, keys
  sorted or as given, since Kashier's SDKs disagree). Either settles; together they
  grant once.
- **Claim before granting:** a payment becomes paid through one conditional UPDATE, so
  the return and the webhook racing in two workers cannot enrol twice.
- **Webhook answers 200 to anything signed** (an order that is not ours, a wrong amount, a
  repeat); only a bad signature is refused, so Kashier stops retrying what is decided.
- **Test mode is admins-only.** Kashier's test cards are public; a test-mode checkout open
  to everyone would hand out courses for a card number anyone can look up.
- **The Secret key is optional;** the admin screen still has its field.

## What happened with the keys

- Merchant ID: valid. Kashier's checkout page names the merchant ("Baytra", sic) in test
  and live.
- Payment API key: a test-mode sandbox payment with Kashier's own test card is refused
  with "Forbidden request", with the canonical link formula, an HTTPS return and no
  webhook. So it is not the **test** key. Most likely it is the **live** key.
- Secret key: refused by both environments.
- Reading: these are live keys, and the live account is not activated yet (Kashier still
  needs the company address among other things). Not tried in live: a live attempt
  would be a real card authorisation on the client's account.

## Acceptance check

- [x] Backend: `tests/test_kashier.py` (13) against Kashier's published formulas; full suite
  1033 passed.
- [x] Local sandbox run with the client's keys: admin sees the gateway, a visitor does
  not; the checkout link opens Kashier's test page for this merchant.
- [ ] A test-mode payment (card and wallet) completes and enrols, with the test keys.
- [ ] Live activation; live keys in; mode switched to live; first real payment watched.
- [ ] Webhook URL also registered in the Kashier dashboard (belt and braces).
