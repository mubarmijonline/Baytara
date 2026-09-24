# 20 — Discount codes, and the rule that the server names the price

**Status:** done and live. Backend 341 tests, app 255 tests, website 103 tests, all green.
Migration applied to the live database; the API, the site and the admin are deployed.

## Goal

The client's ask: codes that marketing partners and influencers hand out, applying a
percentage discount at checkout.

## The rule everything else follows

**The browser sends a code. It never sends an amount.**

`/payment/quote?code=` previews a discount and `/payment/checkout` recomputes it from
scratch, from the code alone, at the moment the Payment row is written. Nothing the client
posts — not a discount, not a final price, not the figure it showed the buyer a second
earlier — reaches the charge. A client that could name its own discount is a client that
could buy a course for nothing, and "the field is disabled in the UI" is not a control.

The recomputation is not paranoia about tampering alone: a code can expire, or hit its cap,
between the quote and the checkout. A refused code then **fails the checkout** rather than
quietly charging full price. Someone who typed a code and watched the undiscounted amount
leave their account has been overcharged, whatever the small print says.

`Payment.amount` stays the charged figure, so the webhook's amount check and any refund
still measure against what was actually taken. The list price is `amount + discount` rather
than a third stored number that could disagree with the other two.

## What a code can do

Percentage or fixed amount; an optional start and expiry; a total cap and a per-buyer cap.
The per-buyer cap defaults to **one**, because a discount meant to win a new customer
should not fund that same customer's whole catalogue. Either cap may be left empty for no
ceiling. Both were built because the answer to "once per account, a fixed number, or
unlimited?" is that different partners want different things.

A fixed discount larger than the price takes the price to zero, never below it.

## No redemption table, deliberately

Usage is counted from payments that reached `paid`. A code is spent when money changes
hands, not when somebody opens a checkout page and wanders off, and there is a test for
exactly that: a `pending` payment does not burn a one-use code.

A separate ledger would have to be reconciled with `payments` on every abandoned session,
every gateway failure and every refund, and the two would drift. A refunded payment still
counts as used, because the code did its job.

## Deleting

A code nobody has used is deleted. A code that has been used is **deactivated instead** and
says so — it is part of the payment record, and deactivating stops it working just as
effectively. The code string itself is not editable after creation: partners have already
put it on posters and in captions, and renaming it would silently break every one.

## The migration, and what was taken out of it

Autogenerate proposed dropping four unique constraints and reshaping an index that have
nothing to do with this feature — `certificates.serial`, `learning_paths.slug`,
`video_playback_events.client_event_id`, `video_playback_sessions.public_id`. That is
pre-existing drift between the models and the live schema. Dropping uniqueness on
certificate serials would quietly allow two certificates to claim the same number, so all
of it was removed from the migration and is noted at the top of the file. **The drift is
real and still needs its own look.**

## Where it appears

- **Website checkout** — a code box above the pay button, showing the new total with the
  list price struck through. Applying a code is a re-quote, not arithmetic in the browser.
- **Admin → أكواد الخصم** — issue codes, see uses against the cap, enable and disable.
- **Android app** — the same field. iOS has no checkout at all under the reader model, so
  it has no code box either.

## Verified against the live API

Create (the code is upper-cased), list, duplicate refused with 409, a 150% discount refused
with 422, delete. The test code was removed afterwards.
