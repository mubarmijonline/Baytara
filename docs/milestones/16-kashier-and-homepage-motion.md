# Milestone 16 — Kashier readiness, and motion on the homepage

Status: **delivered, with one part deliberately not switched on.**

## Goal

Two things the client asked for on 2026-09-20, plus one bug that arrived with them.

1. **Payment.** Kashier is the gateway being onboarded. Their approval is gated on the
   website showing real courses at real prices, and the merchant keys do not exist yet.
   So: build the whole integration, prove it, and leave it dark until the keys arrive.
   No migration is performed and none is needed.
2. **Motion.** Entrance and hover movement on the homepage, restrained enough for a
   veterinary school and cheap enough not to cost a frame on a mid-range phone.
3. **Bug.** "ابدأ المشاهدة مجاناً" on a course page opened a page that did not exist.

## What "ready" means for Kashier

The client's instruction was to change nothing live and to be ready. Concretely:

- `backend/app/services/kashier.py` speaks the v3 payment-session API: create a session,
  read a payment back, verify a webhook.
- `POST /payment/checkout` picks the gateway at request time. Kashier wins when its three
  keys are present; Fawaterak remains until then; with neither, checkout answers 503 and
  the buy page already says so in Arabic.
- `GET /payment/gateway` reports which gateway is live, so a screen can decline to offer a
  card button it cannot honour.
- `POST /payment/kashier/webhook` verifies `x-kashier-signature` and grants access.
- The three keys and the test/live switch are Setting rows, edited in the admin portal
  under Integrations. **Pasting them in is the entire go-live step.** No deploy, no
  migration, no restart.

Signature verification follows Kashier's published rule rather than our own idea of it:
the payload names the fields it signed in `data.signatureKeys`, those are sorted, their
values URL-encoded, joined as a query string and HMAC-SHA256'd with the Payment API key.

Two refusals are deliberate and tested:
- An event whose signature does not verify grants nothing and returns 400.
- An event that verifies but carries an amount other than the one we quoted returns 409
  and grants nothing. Kashier's own documentation says never to treat anything but a
  server-side check as settlement.

## Acceptance check

- With no keys set: `GET /payment/gateway` returns `{gateway: null, ready: false}` and
  checkout returns 503. Nothing about the site changes.
- With the three keys set: checkout returns a Kashier session URL, a signed `pay` webhook
  enrolls the buyer exactly once however many times it is re-delivered, a bad signature
  and a wrong amount both grant nothing.
- `backend/tests/test_kashier.py`, seven tests, all of the above.

## What is *not* done, and why

- **No live transaction has ever run.** Every test mocks the HTTP. The first real payment
  will be the first real payment.
- **No migration off Fawaterak.** Existing Fawaterak rows keep their gateway and their
  webhook. The switch is one-directional and happens the moment Kashier's keys are saved.
- The redirect back from the hosted page is treated as a hint only; the webhook and the
  server-side read are what grant access.

## Motion

Rules the whole implementation is built on, in `frontend/web/src/lib/motion.js` and the
`homepage motion` block of `theme/global.css`:

- **transform and opacity only.** Nothing that triggers layout is ever transitioned, so
  no animation here can cause a layout shift or block the main thread.
- **No animation library.** IntersectionObserver plus CSS transitions. The bundle grows
  by about two kilobytes.
- **`prefers-reduced-motion` means off, not slower.** Every element is shown in its
  finished state immediately.
- Observers unobserve on first intersection, so a long page does not keep dozens alive.

What moves: the hero rises once on load and its primary button breathes very slightly
(3.6s, 1.8% scale, paused on hover); card rows arrive staggered as they scroll in;
thumbnails grow 4% inside a clipping frame on hover; the statistics count up once, with
tabular figures and a reserved width so the digits change without moving the words; a
back-to-top button fades in past the first screen.

The brief asked for testimonial carousel transitions. That section is not a carousel and
never has been — it is a three-up grid — so it got the same arrival as the other rows
rather than a slider nobody asked to scroll.

## The bug

`/learn/:courseId/:lessonId` passes whatever is in the URL to `GET /api/v1/courses/<slug>`.
The course page's own free-watch button passed `course.id`, which matched no slug, so the
player rendered its not-found screen. Every other link on the site already passed the slug.
Fixed at the button, and the endpoint now resolves a numeric id as well so links already
shared keep working — without letting an id reach a course that is not published. The exam
page's "continue the course" link had the same shape of fault: it omitted the lesson
segment entirely and matched no route at all.

`backend/tests/test_course_lookup.py` covers the endpoint.
