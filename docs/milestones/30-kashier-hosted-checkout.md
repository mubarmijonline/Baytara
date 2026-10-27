# 30 - Kashier through the hosted payment page

**Status:** code live; test-mode keys in production (admins only). A real test-mode card
payment completed end to end on 2026-10-27. Live mode waits on the client's go-ahead.

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

- **The Secret keys were never wrong.** Both arrived as iPhone WhatsApp screenshots, and
  iOS hyphenates a long word where it wraps it: every hyphen in both Secret keys sat at
  a line end, never mid-line. Without those hyphens (format: 32 hex, `$`, 96 hex) both
  keys are accepted, test and live (a missing session answers 404 instead of 401). The
  first reading of 2026-10-26, "live keys on an account not yet activated", was wrong.
- The first API key (`…22ae`) is the live Payment API key; the test one ends `…c403`.
- Kashier still shows the business name as "Baytra".

## Test-mode run, 2026-10-27

- Card: Kashier's test Visa, 3-D Secure emulator approved, redirect back with
  `paymentStatus=SUCCESS`; our return endpoint verified the signature and settled: payment
  `paid`, enrolment `active`. Kashier's server notice reached production and was answered
  200 (only a bad signature is refused), so real Kashier webhooks verify there.
- Wallet: the sandbox shows "تمت الموافقة" in an error-styled box and sends neither a
  redirect nor a notice, so wallets cannot be proved in test mode. Watch the first live
  wallet payment; the daily reconciliation is the safety net.

## Acceptance check

- [x] Backend: `tests/test_kashier.py` (13) against Kashier's published formulas; full suite
  1033 passed.
- [x] Local sandbox run with the client's keys: admin sees the gateway, a visitor does
  not; the checkout link opens Kashier's test page for this merchant.
- [x] Test-mode card payment completes and enrols; Kashier's webhook verifies in production.
- [ ] Wallet: not provable in Kashier's sandbox; watch the first live one.
- [ ] Live activation; live keys in; mode switched to live; first real payment watched.
- [ ] Webhook URL also registered in the Kashier dashboard (belt and braces).
