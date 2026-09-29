# mobile-05 — Payments (Android)

**Status:** done for Android. **The iOS purchase decision is still open** and is what
milestone 8 must settle.

## Goal

Buy a course, a bundle, a standalone video, or renew lapsed access, through the Fawaterak
hosted gateway, without ever treating the gateway's redirect as proof of payment.

## There are four payment kinds, not one

`PAYMENT_KINDS` in `backend/app/models/payment.py` is
`("enroll", "renewal", "bundle", "video")`. The contract doc shows only `enroll`, which
hides three flows.

**`renewal` is the one that matters most.** It is priced at `renewal_percent()` of the
course price (admin-set, default 30%), and it is where two things lead:

- an `access_expired` refusal from the player (milestone 0's error map already routes there);
- a lapsed enrolment tile in My Learning.

Sending those to a full-price purchase would charge a returning customer the whole price
again for access they already bought once.

The quote for a renewal carries `renewal_percent`, and the screen prints it: *"Renewal costs
30% of the course price."* The bare number does not explain itself.

## The redirect is not proof of payment

The gateway returns to
`https://baytara.app/payment/callback?status=success&pid=123`.

`status` is attacker controllable, and it can arrive **before** the Fawaterak webhook has
landed. So it is read for exactly one purpose: nothing. Only `pid` is taken, and only as an
id to ask about. `GET /payment/<id>` is the sole authority, and only the webhook can move a
row to `paid`.

Two tests pin this in both directions:

- a `status=success` redirect over a pending payment reports **pending**, not paid;
- a `status=fail` redirect over a paid payment reports **paid**.

The second matters as much as the first. A user who was charged must not be told it failed.

## Pending is not failure

If polling gives up before the payment settles, the outcome is `stillPending`, with copy
that says so and tells the user **not to pay again**. A bank transfer can settle minutes
later and the webhook will record it. Reporting "failed" would produce duplicate payments
from users trying again.

Polling backs off (1, 2, 3, 5, 8, 13 seconds) rather than hammering, and a dropped request
mid-poll is not treated as an answer.

## The gateway opens in a Custom Tab, never a WebView

`flutter_custom_tabs` on Android, `SFSafariViewController` on iOS. The page handles card
details; putting that in an app-controlled WebView is both a security problem and a
store-review one. It is emphatically never the VdoCipher WebView.

## The iOS decision is deferred, and kept cheap

`lib/features/payments/data/purchase_availability.dart` gates every purchase entry point
behind one flag. Apple requires IAP for digital content and Fawaterak checkout will very
likely draw a Guideline 3.1.1 rejection, but that binds only at submission.

When the decision is made it is one edit here:

- **reader model** — return false on iOS: prices stay visible, buy buttons and any link out
  disappear (linking out is what the rule actually forbids);
- **real IAP** — the iOS branch routes to StoreKit, and the backend gains a
  receipt-validation endpoint.

Retrofitting this after the catalogue, course detail, pricing and bundle screens exist would
be a far larger edit. That is why it went in now despite the decision being open.

## What was built

```
lib/features/payments/
  data/payment_dto.dart              four kinds, quote, payment, checkout session
  data/payment_repository.dart       quote, checkout, poll, history
  data/purchase_availability.dart    the one flag
  application/checkout_controller.dart  stages, backoff poller, callback parsing
  application/deep_links.dart        App Links, incl. the cold-start link
  ui/buy_screen.dart                 quote -> gateway -> confirm
  ui/payment_return_screen.dart      where the deep link lands
  ui/payments_screen.dart            history
android/app/src/main/AndroidManifest.xml   App Links intent filter
```

## Tests

`flutter test` — **147 passing** (131 from mobile-00..04, 16 new), `flutter analyze` clean.

`checkout_test.dart` covers: polling stops on settle and survives a mid-poll failure; giving
up returns pending rather than inventing a failure; both redirect-vs-server mismatches; a
non-numeric `pid` rejected rather than coerced; all four kinds; renewal's percentage.

## Server-side task this depends on

**`https://baytara.app/.well-known/assetlinks.json` must list the app's signing
fingerprint**, or Android shows a disambiguation dialog instead of opening the app silently
on the payment return. The flow still works without it, just less smoothly. This is a
web-server change, outside the app, and needs the release keystore fingerprint that does not
exist yet.

## Still to verify on hardware

- [ ] A real purchase completes and unlocks the content after the deep-link return.
- [ ] The App Links filter opens the app rather than the browser (needs assetlinks.json).
- [ ] A cold-start deep link is caught (the app being closed when the gateway returns).
- [ ] A deliberately abandoned payment reports pending, not failed.
