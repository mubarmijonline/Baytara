# Build the Baytara Flutter app — implementation prompt

Paste this whole file as the opening prompt for the Flutter build. Every endpoint,
header, error code and limit below was read out of the running backend
(`/development/projects/baytara/backend`) on 2026-08-18 — treat it as the contract,
not as a sketch. Where the backend is the authority, the file says so.

---

## 0. What you are building

A Flutter app (Android + iOS) for **Baytara**, an Arabic veterinary learning platform.
The web app already exists at `https://baytara.app`; the API is shared, unchanged, and
must not be modified to suit the app. The design is supplied separately.

Hard requirements that shape everything else:

1. **Video is DRM-protected (VdoCipher).** The app must block screen recording where the
   OS allows it, and detect-and-react where it does not.
2. **Two devices per account**, enforced server-side, keyed on a device id the client
   generates and must keep stable.
3. **A phone number is mandatory before any video plays** — it is burned into the
   video watermark. Google sign-in does not supply one.
4. **Arabic-first, RTL by default**, with an English toggle. The API localises its own
   content when asked.

---

## 1. Stack

- Flutter (stable), Dart 3, `minSdkVersion 21` (VdoCipher floor), iOS deployment target 12.
- State: Riverpod (or Bloc — pick one and stay consistent). No setState-driven networking.
- Routing: go_router, with redirect guards (see §6).
- HTTP: `dio` with an interceptor stack (auth, device id, language, refresh, logging).
- Secure storage: `flutter_secure_storage` for both tokens and the device id.
- Video: `vdocipher_flutter` **2.8.5** (verified publisher vdocipher.com; Android API 21+,
  iOS 12+). Player widget is `VdoPlayer`, fed an `EmbedInfo.streaming(otp:, playbackInfo:)`.
- Screen protection: `screen_protector` **1.5.3** (avoid 1.4.4–1.4.13, documented crashes)
  plus the native code in §8. Do not rely on the package alone.

---

## 2. The client contract — get this wrong and video will not play

### 2.1 Every request

| Header | Value | Why |
|---|---|---|
| `Authorization` | `Bearer <access token>` | on authed calls |
| `X-Baytara-Device-ID` | stable per-install UUID | device binding, playback refuses without it |
| `Accept-Language` | `ar` or `en` | server-side localisation |
| `User-Agent` | **must contain `BaytaraApp/1`** | see below |

Public GETs also accept `?lang=ar|en`; send it.

**The User-Agent marker is not cosmetic.** `backend/app/utils.py` defines
`APP_UA_MARKER = "BaytaraApp/"`, and `POST /video/playback` refuses to mint an OTP for a
capture-protected lesson unless the client either is a DRM-capable browser or carries
that marker. Set it on the Dio client *and* on any WebView you open. The Capacitor shell
already uses `BaytaraApp/1`; match it exactly.

### 2.2 Device id

Generate a v4 UUID on first launch, store it in secure storage, never regenerate it
(a reinstall producing a new id burns one of the user's two device slots). Send it:

- in the JSON body as `device_id` on `/auth/register`, `/auth/login`, `/auth/google`,
  `/auth/logout`
- in the `X-Baytara-Device-ID` header on every other request

The server puts the device id into the JWT as a claim. `/video/playback` and the event
endpoint both reject a request whose header does not match the token claim
(`device_mismatch`).

### 2.3 Tokens

- Access token: **15 minutes**. Refresh token: **30 days**.
- `POST /auth/refresh` is called with the **refresh** token in the `Authorization`
  header. It returns `{access_token}` only — the refresh token is **not** rotated, so
  after 30 days the user logs in again. Do not treat that as a bug.
- On any `401`: run refresh **once**, replay the original request once, and if the
  refresh itself fails, clear both tokens and route to sign-in.
- **Collapse concurrent refreshes into a single in-flight future.** Several 401s landing
  together must not each mint and overwrite tokens. This bug already bit the web app.
- Refresh also fails with `403 device_not_registered` if the device was removed from
  another session — treat it as a logout with a clear message.

---

## 3. Endpoint catalogue

Base URL: `https://baytara.app/api/v1`. Everything the app needs is below; admin and
instructor endpoints exist but are **out of scope** for this app.

### 3.1 Auth and account

| Method | Path | Body / params | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{name, email, phone, password, device_id}` | phone required, password ≥ 8; `409 email_taken`, `422 validation` |
| POST | `/auth/login` | `{email, password, device_id}` | `401 invalid_credentials`, `403 account_disabled`, `403 device_limit_reached` (returns `devices[]` + `max_devices`) |
| GET | `/auth/google-config` | — | `{client_id}`; empty string means Google sign-in is off — hide the button |
| POST | `/auth/google` | `{credential, device_id}` | `credential` is the Google **ID token**. Returns `{user, access_token, refresh_token, needs_phone}`. `201` if the account was created, `200` if it linked/logged in |
| POST | `/auth/refresh` | — (refresh token in header) | `{access_token}` |
| GET | `/auth/me` | — | `{user}` |
| PATCH | `/auth/profile` | `{phone}` or `{name, headline, location, bio, national_id}` | editable set is server-controlled |
| POST | `/auth/profile/image` | multipart | avatar / cover |
| POST | `/auth/national-id` | multipart image | used by verification |
| GET | `/auth/national-id/image` | — | own image only |
| POST | `/auth/logout` | `{device_id}` | frees that device slot |
| GET | `/auth/devices` | — | `{devices[], max_devices}` |
| DELETE | `/auth/devices/<id>` | — | how a user escapes `device_limit_reached` |

The `user` object carries: `id, name, email, phone, role, locale, is_baytarian,
is_vet_student, headline, bio, location, specialties, national_id, national_id_locked,
has_national_id_image, vet_registration_no, vet_license_no, vet_governorate,
vet_card_expires_at, avatar_url, cover_url, created_at`.

### 3.2 Catalogue (public, auth optional — send the token anyway, it changes what is visible)

| Method | Path | Params |
|---|---|---|
| GET | `/categories` | — |
| GET | `/courses` | `page, per_page (≤50), category, q, duration, min_rating, level, access_type, sort` |
| GET | `/courses/<slug>` | full content tree |
| GET | `/courses/<slug>/reviews` | `page, per_page` |
| POST | `/courses/<slug>/reviews` | `{rating, body}` — enrolled users only (`403 not_enrolled`) |
| DELETE | `/courses/<slug>/reviews/mine` | — |
| GET | `/videos` | `page, per_page, category, access_type, q, duration, sort` |
| GET | `/videos/<id>` | single video |
| GET | `/bundles`, `/bundles/<slug>` | — |
| GET | `/paths`, `/paths/<slug>` | learning paths (currently hidden on web) |
| GET | `/instructors`, `/instructors/<user_id>` | — |
| GET | `/articles`, `/articles/<slug>` | blog + free content |
| GET | `/settings` | all site copy/config the app should render rather than hardcode |
| POST | `/contact` | `{name, email, message}` |

Every video/course carries the access flags the UI must obey: `can_play`,
`requires_auth`, `requires_phone`, `access_type` (`free` / `vet_free` / `baytarian` /
`general`).

**Access rules (server-enforced, mirror them in the UI, never instead of it):**
`free` = anyone with an account · `vet_free` = free but verified vets only ·
`baytarian` = paid, verified vets only · `general` = paid, and **verified vets are
refused it** (`non_veterinarians_only`).

### 3.3 Learning

| Method | Path | Notes |
|---|---|---|
| GET | `/enrollments` | user's enrolments |
| POST | `/enrollments` | `{course_id}` — `402 payment_required` for paid, `403` + reason for tier failures |
| GET | `/progress?course=<slug>` | `{enrolled, expired, lessons{}, percent}` |
| POST | `/progress` | `{lesson_id, ...}` → recomputed progress |
| GET | `/learning-summary` | dashboard header numbers |
| GET | `/activity?limit=` | recent activity feed |
| GET | `/certificates` | earned certificates |
| GET | `/certificates/<serial>` | public verification |
| GET | `/video/my-progress` | last 10 videos with resume position + completion |

### 3.4 Payments (Fawaterak hosted checkout)

| Method | Path | Notes |
|---|---|---|
| GET | `/payment/quote` | `kind=enroll\|...`, `course_id\|bundle_id\|video_id` → `{expected_amount, title, ...}` |
| POST | `/payment/checkout` | `{kind, course_id?, bundle_id?, video_id?}` → `{url, payment_id}`, `201` |
| GET | `/payment/mine` | history |
| GET | `/payment/<id>` | poll after returning from checkout |

`checkout` returns a **hosted gateway URL**. Open it in an in-app browser
(`flutter_custom_tabs` / `SFSafariViewController`), not a bare WebView, and not the
VdoCipher WebView. The gateway redirects to `https://baytara.app/payment/callback?...` —
register that as a deep link (App Links / Universal Links) so the app can capture the
return, then confirm the real state with `GET /payment/<id>`. **Never trust the redirect
parameters as proof of payment**; the webhook is the source of truth.

### 3.5 Verification ("Baytarian")

| Method | Path | Body |
|---|---|---|
| GET | `/baytarian/me` | `{is_baytarian, is_vet_student, request}` |
| POST | `/baytarian/card/preview` | multipart `front`, `back` — reads the syndicate card **without committing**, returns `{report}` |
| POST | `/baytarian/card` | multipart `front`, `back` → `201 {request, is_baytarian}` or `422 {error: card_not_verified, report}` |
| POST | `/baytarian/document` | multipart `route` (`national_id` / `other`), `front`, optional `back`. `201` verified, **`202 {pending: true}`** means a human will review, `422 {error, verdict}` |
| POST | `/baytarian/request` | legacy multi-document upload; prefer the two above |

Errors: `409 already_verified`, `409 request_pending`, `422 national_id_required`,
`503` when the reading service is unavailable. Reading a document takes **tens of
seconds** — see §7 for the UX this demands.

### 3.6 Notifications

| Method | Path |
|---|---|
| GET | `/notifications` (last 50 + `unread`) |
| GET | `/notifications/unread-count` |
| POST | `/notifications/<id>/read` |
| POST | `/notifications/read-all` |

Poll every 60s while the app is foregrounded. There is **no push infrastructure yet** —
if you want FCM/APNs, that is a backend change and must be agreed separately.

### 3.7 Video playback — see §7, this is the security-critical path

| Method | Path |
|---|---|
| POST | `/video/playback` |
| POST | `/video/playback-sessions/<session_id>/events` |

---

## 4. Screens to implement

**Auth and onboarding**
1. Splash / bootstrap — restore tokens, `GET /auth/me`, decide route.
2. Sign in / sign up (tabbed, as on web) — email + password, plus **Sign in with Google**
   (hidden when `/auth/google-config` returns an empty `client_id`).
3. **Phone completion** — mandatory gate. Any signed-in user with no phone is routed here
   before anything else, with the `next` destination preserved. Country picker defaulting
   to Egypt, leading zero stripped, mobile-number validation.
4. Device limit — shown on `403 device_limit_reached`: lists the registered devices with
   last-seen, lets the user remove one and retry.

**Catalogue**
5. Home — hero, stats, categories, free videos, instructors, testimonials, all driven by
   `/settings` + the list endpoints.
6. Courses list with the full filter set (category, level, duration, rating, access type,
   sort, search) and pagination.
7. Course detail — content tree, instructor, reviews, enrol / buy CTA reflecting the
   access tier.
8. Videos list + video detail.
9. Bundles list + detail. Paths list + detail (behind a flag, mirroring web).
10. Instructors list + instructor profile.
11. Articles: blog list, free-content list, article detail.

**Learning**
12. My learning / dashboard — enrolments, progress, resume points from
    `/video/my-progress`, activity feed.
13. Course player screen — lesson list beside/below the player, progress ticks,
    auto-advance, resume.
14. Certificates list + certificate view/share.

**Money and status**
15. Membership / pricing — explains the four tiers honestly (§3.2) and routes vets to
    verification. Free content is open to anyone with an account; say so first.
16. Checkout flow — quote → hosted gateway → deep-link return → poll `/payment/<id>`.
17. Payments history.

**Verification**
18. Verification start — pick the route (syndicate card / national ID / faculty card).
19. National ID capture + save.
20. Document capture (camera or gallery, both sides where relevant) with a live preview.
21. **Processing screen** — see §7.3.
22. Result screen — verified / verified as student / **sent to human review** (`202`), each
    with its own copy and next step.

**Account**
23. Profile — view/edit name, headline, bio, location, avatar, cover.
24. Devices — list and remove.
25. Notifications list — read-on-tap, mark all read.
26. Settings — language (ar/en with full RTL flip), logout, about, privacy policy
    (`https://baytara.app/privacy`), contact.

---

## 5. Playback protocol — implement exactly

### 5.1 Minting a session

```
POST /video/playback
headers: Authorization, X-Baytara-Device-ID, User-Agent(BaytaraApp/1)
body:    {"lesson_id": <int>, "course_id": <int|null>}
200 →    {otp, playbackInfo, session_id, resume_position_seconds, audio_mark}
```

Feed `otp` + `playbackInfo` straight into `EmbedInfo.streaming`. Seek to
`resume_position_seconds` before the first frame if it is > 0. Never cache an OTP: it is
short-lived, single-session, and the server counts every mint.

### 5.2 Reporting events — required, not optional

```
POST /video/playback-sessions/<session_id>/events
body: {
  "event_id": "<uuid v4, unique per event — the server dedupes on it>",
  "type": "play|pause|resume|heartbeat|ended|player_error|suspicious",
  "position_seconds": int, "duration_seconds": int,
  "watched_seconds": int, "covered_seconds": int,
  "metadata": {...}            // optional; use it for suspicious reasons
}
```

- `play` on first start, `resume` on subsequent starts, `pause`, `ended`.
- `heartbeat` **every 15 seconds while playing**. The server treats a session as live for
  2 minutes past the last event; miss the beat and a second device can claim the stream.
- `player_error` with `metadata.error_code` on player failure.
- `suspicious` whenever the native guard fires (§8). Three suspicious events in 15
  minutes and the server blocks playback for that window **and notifies every admin**, so
  do not report speculatively — but do not silently swallow real ones either.

Send events with the same device header. `device_mismatch`, `session_not_found`,
`session_closed` and `event_id_conflict` are all possible; on `session_closed`, stop the
player and re-mint rather than retrying.

### 5.3 Every denial `/video/playback` can return, and what the UI does

| Code | HTTP | UI |
|---|---|---|
| `authentication_required` | 401 | route to sign-in |
| `account_disabled` | 403 | terminal message, offer contact |
| `phone_required` | 403 | route to the phone gate |
| `device_required`, `device_mismatch`, `device_not_registered` | 403 | re-login on this device |
| `device_limit_reached` | 403 | device management screen |
| `lesson_not_found` | 404 | back to catalogue |
| `no_video` | 409 | "not available yet" |
| `not_entitled` | 403 | enrol/buy CTA |
| `needs_baytarian` | 403 | route to verification |
| `non_veterinarians_only` | 403 | explain this tier is for non-vets |
| `already_playing` | 409 | "playing on your other device" + retry |
| `too_many_requests` | 429 | 40 OTPs/hour ceiling — ask them to wait |
| `suspicious_activity` | 403 | blocked for 15 minutes, explain plainly |
| `app_required`, `mac_needs_safari`, `unsupported_browser`, `browser_not_supported` | 403 | **should never happen in the app** — if you see one, the User-Agent marker is missing |
| provider failure | 503 | transient, offer retry |

### 5.4 Watermarks

The server burns a **dynamic visual watermark** into the stream (name, email, phone, IP,
session id) — the app does nothing but must not cover it. The response also carries
`audio_mark` (the user id), which the web player encodes as an inaudible tone in the
audio mix so a screen recording still names the account. **Port this to the app**: play a
low-amplitude, inaudible marker tone alongside playback for the same reason. See
`docs/AUDIO_WATERMARK.md` and `frontend/web/src/lib/audioWatermark.js`.

---

## 6. Route guards

Enforce in `go_router.redirect`, in this order:

1. No token → public routes only.
2. Token but `user.phone` empty → **force** the phone screen, preserving `next`.
3. Player route → require `can_play`; otherwise route to the reason (buy / verify / gate).
4. Verification routes → skip entirely if `is_baytarian` is already true.

---

## 7. Long-running work must look alive

### 7.1 Playback start
Minting an OTP plus DRM licence acquisition is seconds, not milliseconds. Show a real
loading state over the player, never a frozen frame.

### 7.2 Uploads
Card and document uploads are large images over mobile networks. Show byte progress from
Dio's `onSendProgress`, and never lose the file to a session expiry — the upload must go
through the same authenticated client that refreshes tokens.

### 7.3 Verification processing (copy the web behaviour)
Reading a document takes **10–40 seconds**. The screen must show: a spinner, what is
happening, an honest elapsed-seconds counter, and the promise that if a human has to
review it, the answer arrives in notifications. On `202` the result screen says
explicitly **do not resubmit**. This is already solved in
`frontend/web/src/pages/VerifyVet.jsx` — mirror it.

---

## 8. Native anti-recording — the part that actually matters

Be honest about what each layer does. Two things genuinely *prevent* capture; the rest
only *detects* it.

### 8.1 Android — prevention is real

- Set `FLAG_SECURE` on the activity: recorders capture black, screenshots are blocked
  system-wide for the window.
  ```kotlin
  window.setFlags(WindowManager.LayoutParams.FLAG_SECURE,
                  WindowManager.LayoutParams.FLAG_SECURE)
  ```
  Apply it **on entering any player or document-capture route** and clear it on exit, or
  app-wide if you accept blocking screenshots everywhere. `screen_protector`'s
  `protectDataLeakageOn()` wraps this; keep the native call as the source of truth and
  verify with a real recorder on a real device.
- VdoCipher plays through **Widevine**. On L1 devices the video path is hardware-protected;
  on L3 devices it is not, and a determined capture can succeed. Read the security level at
  runtime and, if the product wants it, refuse playback on L3.
- Android 15+ exposes a screen-recording callback
  (`WindowManager.addScreenRecordingCallback`) — wire it where available and report
  `suspicious`. Older versions have no reliable detection; do not fake one.
- Block casting/mirroring: watch `MediaRouter` for a remote route and pause.

### 8.2 iOS — DRM prevents, everything else detects

- **FairPlay is the real protection.** VdoCipher's iOS path renders DRM content black in
  screen recordings and in AirPlay mirroring. Verify this on device before shipping; it is
  the whole iOS story.
- `UIScreen.main.isCaptured` + `UIScreen.capturedDidChangeNotification`: on capture start,
  **pause playback, cover the picture, report `suspicious`**, and resume only when it stops.
- `UIApplication.userDidTakeScreenshotNotification`: iOS gives no way to block a
  screenshot. Report `suspicious`. Do **not** ship the "hidden UITextField with
  `isSecureTextEntry`" trick as if it were real protection — it is a rendering hack that
  Apple can break at any release.
- External display / mirroring: `UIScreen.screens.count > 1` → pause and explain.
- App switcher: cover the snapshot on `applicationWillResignActive`
  (`protectDataLeakageWithBlur()`), restore on `didBecomeActive`.

### 8.3 Shared guard behaviour

One `PlaybackGuard` service, platform channels underneath, that:

1. pauses the player and covers the surface on any capture signal,
2. posts a `suspicious` event with `metadata.reason` (`screen_recording`, `screenshot`,
   `mirroring`, `background`),
3. resumes only on an explicit user action after the condition clears.

Also pause on app background, incoming call, and route change — the web app does the same
and the server already scores these events.

### 8.4 Say this in the README

FLAG_SECURE (Android) and FairPlay/Widevine L1 stop a recording. Screenshot detection,
mirroring detection and jailbreak/root checks do not stop anything — they raise the cost
and produce evidence. Do not let anyone believe the app is uncapturable.

---

## 9. Cross-cutting requirements

- **Localisation**: `flutter_localizations`, `ar` default with `TextDirection.rtl`, `en`
  secondary. Never hardcode Arabic in widgets — the API already returns localised content
  and `/settings` carries the site copy.
- **Offline**: cache catalogue responses (etag/last-fetched) for browsing. **Never cache
  OTPs, playbackInfo, tokens in plain storage, or any downloaded video.** Offline video
  download is out of scope unless the backend adds it.
- **Errors**: one mapper from `{error: code}` to localised copy, used by every screen. The
  backend speaks in stable codes — the tables above are that vocabulary.
- **Analytics**: none until agreed. The privacy policy at `/privacy` currently states no
  third-party analytics; adding a tracker means changing that page first.
- **Accessibility**: semantic labels on every control, ≥44pt touch targets, respect
  `prefers-reduced-motion`, and never encode state with colour alone.

---

## 10. Definition of done

- [ ] Sign in with email, with Google, and register — each mints and stores both tokens.
- [ ] Access token expiry mid-session is invisible to the user; concurrent 401s cause exactly one refresh.
- [ ] A Google account with no phone cannot reach any player screen.
- [ ] Signing in on a third device produces the device screen, and removing one lets it in.
- [ ] A protected lesson plays on both platforms, watermark visible.
- [ ] Heartbeats land every 15s; the admin video report shows the session with correct watched time.
- [ ] Screen recording on Android yields a black file; on iOS playback pauses and a `suspicious` event is recorded.
- [ ] Three suspicious events in 15 minutes block playback and the app explains why.
- [ ] A paid course completes checkout and unlocks after the deep-link return.
- [ ] Verification: instant approval, `202` manual review, and rejection each render their own screen.
- [ ] Every string appears correctly in both ar (RTL) and en (LTR).

Widget tests for the guards (auth redirect, phone gate, access tier), and one integration
test per critical flow: sign-in → play, and verify → result.

---

## 11. Ask before you assume

If any of these turn out to be needed, stop and raise it — they are backend or product
decisions, not client ones: push notifications, offline downloads, in-app purchases
(Apple will require IAP for digital content — the current Fawaterak flow may be rejected
by App Review), password reset (**no such endpoint exists today**), and account deletion.
