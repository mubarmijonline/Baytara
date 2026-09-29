# 17 — Selling on the web, and saying so clearly when a video will not play

**Status:** done. Web build and 99 web tests green; 251 app tests green, `flutter analyze`
clean. Nothing on iOS hardware, as ever.

## Goal

Act on the client's decision of 2026-09-22: payment happens on the website, outside the
app. Then make the two journeys that decision touches actually work — the direct payment
link, and what a viewer is told when a lesson refuses to play.

## The decision, and the part of it that could not ship as asked

The client agreed to the reader model on iOS and asked for one addition: a **direct payment
link**, so a student taps and lands straight on the gateway.

The link is right. Putting it **inside the iOS app** is the one thing that cannot be done.
A button or link that sends a user to any purchasing mechanism other than In-App Purchase
is precisely what App Store Guideline 3.1.1 prohibits, and it is refused exactly as an
in-app gateway would be — "sell on the web but link to it from the app" is not a middle
ground, it is the rule's central example. The exceptions that exist (the US storefront
after the Epic injunction, the EU under the DMA, the reader-app external-link entitlement)
are storefront- and entitlement-specific, and none applies to an Egyptian storefront by
default. That area moved repeatedly through 2025 and 2026, so the current guideline text is
what to read before submitting, not this paragraph.

So the direct link lives where Apple has no say: WhatsApp, email, the website. A student
sent `https://baytara.app/buy/<slug>?go=1` lands on the gateway in their browser and signs
in to the app afterwards to watch. Same journey, no commission, no rejection.

## What was built

### The reader model, made real

`purchasesEnabled` now returns false on iOS. The flag existed since mobile-05, but its own
comment claimed every purchase entry point asked it first and **that was not true**: only
the pricing page and the buy screen did. Three others pushed straight to `/buy/...` — the
course page, the video page, and the renewal prompt on the learning shelf. Flipping the
flag alone would have left buy buttons on all three, leading to a checkout screen that
hides its own confirm button: a dead end, and a worse review outcome than not flipping it.

All five now ask. `test/purchase_availability_test.dart` reads the source tree and fails if
a new screen pushes `/buy/` without consulting the flag, because Guideline 3.1.1 is
enforced against the shipped binary rather than against intentions, and a hole in this is
invisible until review.

The refusal copy shows the price and says buying is not available in the app. It gives no
link and no instruction to go elsewhere, which is the part people get wrong.

### The direct payment link

`/buy/<slug>?go=1` starts checkout by itself. Three details:

- it runs **after** the server quote, not on page load, so nobody is sent to pay before we
  know what they owe and the price on the link can never differ from the price at the
  gateway;
- the course and price are painted first, so a slow gateway leaves the student looking at
  what they are about to buy rather than at a blank page;
- `go` survives the sign-in round trip. Without that, a link sent to someone not signed in
  loses the one thing that made it direct.

A ref guards the trigger. A state check alone is not enough: React runs effects twice on
mount in development, and both runs would have seen `idle` and opened two payments against
one link.

### Somewhere to get the link

A link nobody can find is not a feature. The admin course list now has a **لينك الدفع**
button that copies `https://<origin>/buy/<slug>?go=1` to the clipboard, so sending one is
copy and paste rather than assembling a URL by hand.

Three small decisions in it: the origin comes from `window.location`, so a staging admin
hands out staging links rather than live ones; the button appears only on a **paid,
published** course, because a free one has nothing to pay for and a draft's link would 404
in front of a student; and when the clipboard is refused (no permission, or an insecure
origin) the link is shown in the toast so it can still be selected by hand.

### A refusal is a screen, not a caption

Reported from the site: the free "ابدأ المشاهدة مجاناً" button now reaches the lesson, and
then nothing happens.

It was not nothing. `Learn` was already mapping every refusal to the right sentence — that
was fixed earlier. It was **rendering** it as 12px grey text along the bottom of a black
box, under a play button that does nothing, with no action attached. That reads as "still
loading", not as "here is what to do". Opening the same video from its own page showed a
proper lock panel with a button, which is why the two felt like different products.

The refusal now gets the middle of the player: the sentence, and the action that clears it
— verify, add a phone number, sign in, enrol, renew. The destinations are deliberately the
same set as `openRequiredAccess` in `VideoDetail.jsx`, so one refusal does not send people
two different ways depending on which page they opened. Where nothing can be done
(`non_veterinarians_only`, a browser the server refuses, a rate limit) there is no button,
because one would be a promise the server will not keep.

A second, quieter bug fell out of the same code: a **signed-out** viewer never got a
message at all. The mint is skipped without a token, so no error ever arrived and the box
sat on "loading the video" forever. Landing there from the free-watch button is exactly how
someone hit it. They are now told, and offered a sign-in.

### Verification returns to the lesson

`/verify` takes a `next`, and `Learn` passes the lesson. Someone who verifies because a
video asked them to now comes back to that video instead of being dropped on their profile
— which is why the journey felt unfinished even when the verification succeeded.

Only on a real approval. A 202 means a person still has to look, so that outcome goes to
the profile: sending them back to a video that will refuse them again would read as the
verification having silently failed.

## Acceptance

- [x] `npm run build` and 99 web tests pass, including two new ones covering the unverified
      and signed-out refusals.
- [x] `flutter analyze` clean, 251 app tests pass, including the source scan over purchase
      entry points.
- [ ] Walk the free-watch button on the live site as an unverified account: message, verify,
      return, play.
- [ ] Copy a link from the admin, send it over WhatsApp, and pay with a real card.
- [ ] iOS: confirm at review that a build with no purchase path and no link passes 3.1.1.
      This has never been submitted.

## Still open

- **Google Play.** The old code comment asserted in-app checkout is fine on Play for a
  service like this. Play has its own billing policy for digital content and that claim has
  not been checked against the current text. It should be, before the Play submission.
- **The release keystore**, still blocking both the Play upload and App Links verification.
