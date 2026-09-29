# mobile-10 — The library the app never had, and the device rule it only half enforced

**Status:** code complete, `flutter analyze` clean, 247 tests green. **Nothing here has run
on hardware,** and the iOS half has still never been compiled — that remains mobile-08.

## Goal

Close the two gaps between the app and what the client asked for on 2026-09-20: the
library (مكتبة بيطرة) with a read-only reader for book summaries, and the device rule as
the server actually enforces it, including the way out when a learner is stuck.

## Why this milestone exists

The mobile app was built through mobile-00 … mobile-09 against the platform as it stood in
August. Two things moved underneath it.

**The library shipped on the web in September** (`f90cd26`, `eefe28d`): a `books` table, a
`GET /books` shelf, and `GET /books/<slug>/file.pdf` behind `@jwt_required`. The website's
`/blog` index became `/library` with two shelves. The app had no `books` call of any kind,
so an entire client-facing section existed on the site and not in the app. The brief calls
this out by name — "read-only in-app document viewer … for book summaries and articles".

**The device rule grew a second half.** `backend/app/services/device_swaps.py` and
`POST /auth/devices/swap-requests` landed with the client's rule of 2026-09-19: one
self-service device change per window, then an admin decides. The app read neither the
allowance nor the pending request, and had no copy for
`device_swap_limit_reached` — a learner who hit it was shown "something went wrong" and
left with nothing to do.

## What was built

### 1. The library, both shelves

`lib/features/library/` — `Book` DTO, repository, providers, `LibraryScreen` (articles |
books, the same split and the same `?shelf=` as the website), `BookDetailScreen`, and the
reader. `/blog` now redirects to `/library` exactly as the website's does; article URLs are
untouched, so anything shared before September still opens.

The library is public, book pages included. That is the client's reason for the section:
someone arrives for something useful, comes back, and eventually buys a course. Only the
summary itself asks for an account, and the page says so before it asks.

It is also **linked** — from the free-content shelf and from settings. `/blog` had been
routed since mobile-02 and never linked from anywhere, which is the same defect the website
had until `eefe28d`. A route nothing points at is not a feature.

### 2. The reader, and what "protected" honestly means here

`book_reader.dart` renders each page as an image through the platform's own PDF renderer
(`pdfx` 2.11.0 — Android's `android.graphics.pdf.PdfRenderer`, CGPDF on iOS; no pdfium is
bundled). There is no download, no share, no print, no text to select, no system viewer,
and the window-level capture guard the player already owns is turned on for the route.

**This is not DRM, and the code says so.** There is no DRM for a PDF. What the screen does
is remove every affordance for keeping a copy; someone who can read a page can still
photograph it with a second phone. That trade is right for this content — Baytara's own
summary of a published work, kept here so people come back — and stating it plainly is
better than letting "protected" mean something to the client that it cannot mean in fact.

Two details worth knowing rather than discovering later:

- the bytes are fetched with the bearer token and held in memory, but on Android `pdfx`
  copies them to the app's **private cache directory** so the platform renderer can take a
  file descriptor. App-private, invisible to a file manager, cleared by the OS — not a
  download, but not nothing either.
- the reading position is saved per install, not per account, like the website's. There is
  no backend endpoint for book progress and inventing one was out of scope.

### 3. The device rule, in full

The account screen now reads `swaps_used` / `swaps_allowed` / `swaps_reset_at`, says how
many changes are left and when the window turns over, and when the change is spent it
offers the request form that `POST /auth/devices/swap-requests` exists for. A pending
request is shown as pending, with **do not send another one** — because the server answers
a second ask with the first one rather than queueing it.

`SwapAllowance` has two parsers on purpose. `GET /auth/devices` spells the numbers
`swaps_used` / `swaps_allowed` / `swaps_reset_at`; the 403 refusal spells the same three
`used` / `allowed` / `resets_at`. One parser over both reads the refusal as a fresh
allowance and tells a blocked learner they still have a change left, at the exact moment
they do not. There is a test that asserts the difference.

### 4. A shared link that works for everyone

The client's reason for the library is reach: a reader sends a summary to a colleague. So
a book and an article each carry a share action, and what it sends is the **website** URL
for the page.

That single decision is what makes the link work in both directions. Someone with the app
installed is handed the page by the OS — App Links on Android, Universal Links on iOS — and
someone without it reads it in a browser. A custom `baytara://` scheme would do the
opposite: it opens for the people who already have the app and dead-ends for the colleague
who does not, who is the reader the section exists to win.

**The two URL spaces are not the same, and that is the trap.** An article is `/blog/<slug>`
on the website and `/articles/<slug>` in the app; a book is `/library/<slug>` on both.
Sharing the app's own path would hand out URLs the site answers with a 404.
`lib/core/links/app_link.dart` holds the translation in both directions, with a test that
round-trips every link the app hands out back to the screen it came from — the property
that actually matters, and the one a pair of one-way functions drifts out of.

Three pieces have to agree or a link opens the app and then shows nothing: the intent
filters in `AndroidManifest.xml`, the `components` list in the Universal Links file, and
`locationForLink()`. Each of the three says so in a comment naming the other two.

Only paths the app can render are claimed. Claiming more would mean intercepting a link and
showing nothing, which is worse for the reader than the browser they would otherwise have
had; an unmapped link is opened externally rather than swallowed.

The share sheet is `share_plus` 13.3.0, which guards its Kotlin plugin on the AGP version
and so does not add to the KGP warning below.

This is not in tension with the reader's no-share rule: the page is meant to travel, the
PDF is not.

**What is not finished, and cannot be here.** Both hand-offs need a file published at the
site root, and each carries a value this repo does not hold:

- `/.well-known/assetlinks.json` needs the **release signing fingerprint**. `mobile_app`
  still signs release builds with the debug key, so there is no fingerprint to publish —
  the same missing keystore that blocks uploading to Play at all.
- `/.well-known/apple-app-site-association` needs the **Apple team id**, and the App ID
  needs Associated Domains enabled in the developer portal or the build is rejected at
  signing.

Neither file is committed with a placeholder, deliberately: the OS reads a placeholder,
fails to match, and silently stops handing links to the app with no error anyone sees.
`deploy/gen_applinks.sh` writes both the moment those two values exist, reading the package
name and bundle id out of the project so they cannot drift. `deploy/nginx-baytara.conf`
serves both with `application/json` and a real 404 when absent, rather than letting them
fall through to the SPA and answer with `index.html`.

Until they are published the links still work — Android shows a disambiguation dialog
instead of opening silently, and iOS just opens Safari. Nobody hits a dead end.

The iOS entitlement is in place (`ios/Runner/Runner.entitlements`, wired into all three
Runner build configurations). Like everything else in `ios/`, it has never been compiled.

## The defects this surfaced

### A device-limit refusal carries no token, so the blocking screen's "remove" never worked

`_device_limit_response` (backend/app/api/v1/auth.py) answers the failed sign-in with the
machine list and **no tokens**. The blocking device screen then offered a Remove button
that called `DELETE /auth/devices/<id>` — a `@jwt_required` endpoint — anonymously. It
could only ever 401. The emergency request endpoint is equally out of reach from there.

The screen no longer offers a button that cannot work: it explains that the way through is
to sign in on one of the listed machines, free a slot from the account screen, and come
back. That is honest and it works today. **It is not the flow the brief describes**
("provide an in-app prompt to disconnect one existing device and register the current
device"), and it cannot be without a backend change — see below.

### `GET /articles` was being filtered by a parameter the server does not read

The app sent `?kind=blog`; `list_articles` reads `type`. Every shelf therefore received
every article of both kinds: the blog listed advisory content and the free shelf listed
blog posts. Now sent as `type`.

### Every article cover was null

`Article.fromJson` read `j['image']`. `Article.to_dict` emits `cover`. Nothing rendered the
field, so it was invisible until the library shelf needed it.

## Backend gaps this milestone did not close

Client-side fixes cannot reach these.

0. **The release keystore.** Release builds still sign with the debug key, which blocks
   the Play upload and the App Links fingerprint together. It is the single smallest
   unblocking action left on Android.
1. **Freeing a device slot at the moment of refusal.** It needs something the 403 can carry
   — a short-lived, single-purpose token accepted only by the device endpoints, or a
   `POST /auth/devices/release` that takes the credentials again. Until then, a learner
   whose two registered machines are both gone (lost, sold, wiped) can reach neither the
   delete nor the request from a new phone, and has to contact support out of band.
2. **Book reading progress.** Local only, because there is no endpoint.
3. Everything already listed under Phase 12 in `MILESTONES.md` — password reset, account
   deletion (App Store review asks for it), push instead of a 60s poll.

## Acceptance check

- [x] `flutter analyze` — no issues.
- [x] `flutter test` — 247 passing (217 before; 30 new: parsing, the two allowance
      spellings, the public-route guards, three pumped-screen tests covering the shelf
      switch, the visitor's sign-in prompt and a book with no file, and twelve over the
      link translation including the round-trip property).
- [x] `flutter build apk --debug` assembles with the new native dependency (422s,
      exit 0). One warning to keep an eye on rather than act on today: `pdfx` still
      applies the Kotlin Gradle Plugin, and a future Flutter will refuse a plugin that
      does. Current Flutter builds it fine; the alternative (`pdfrx`) bundles pdfium and
      is a much heavier dependency for the same job, so the right move is to watch for a
      pdfx release that migrates to Built-in Kotlin.
- [ ] Read a published summary on a physical Android device, confirm the screenshot is
      refused and a screen recording captures a black frame.
- [ ] Confirm on hardware that removing a device and then removing a second one produces
      the request form rather than a bare error.
- [ ] A shared link opening the app on a device with it installed, and the website on one
      without. Cannot be checked until `assetlinks.json` is published, which needs the
      release keystore.
- [ ] iOS: never compiled. `UIScreen.capturedDidChangeNotification` drives the cover on
      that path and has never run.
