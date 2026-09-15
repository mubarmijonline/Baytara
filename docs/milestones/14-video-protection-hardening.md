# 14 — Video protection hardening (VdoCipher audit follow-up)

**Status:** code complete; tests green; **`strict_browser_policy`, `mobile_requires_app`
and the FairPlay certificate status are still unverified on the live account.**

## Goal

Close the gaps the VdoCipher audit ranked (see the audit report of 2026-09-11): pin every
OTP to its viewer, keep paid content off the DRM-less server, and give the dashboard the
per-video play counts the client asked for. The browser-support decision (warn vs block)
is the client's and is not in this milestone.

## What changed

### OTPs are pinned
`POST /video/playback` now sends VdoCipher two rules with every OTP
(`backend/app/services/video_provider.py`):

- `ipGeo: {allow: [<viewer IP>]}` — only for a public IPv4. A private or loopback address
  (local dev behind nginx) would pin the OTP to an address the licence server never sees
  and refuse the play that was just allowed; the rule set is IPv4-only in any case.
- `whitelisthref: <SITE_URL hostname>` — browsers only. The native app sends no referrer,
  so a hostname rule would refuse every native play; `baytara_app(user_agent)` skips it.
  On localhost nothing is sent, so development is unaffected.

The visible watermark gains `ID <user.id>`: name, email and phone can all change, the id
cannot, and a leaked recording must still point at exactly one row.

### Paid content cannot land on our server
Our own server has no DRM; that trade is agreed for free content only. Two refusals, both
`422 paid_requires_vdocipher`:

- `POST /admin/videos/<id>/upload` on a paid video, checked before any byte is read;
- `PATCH /admin/videos/<id>` re-pricing a `source=local` video as paid.

The in-course upload form hides the "Baytara server" option on a paid course and says
why; the standalone upload page (local-only) refuses to start with a paid tier selected.

### Play counts (client request)
`plays` (sessions that reached a first frame) and `viewers` (distinct accounts) per video,
counted from `video_playback_sessions` in one grouped query per page — no new column,
correct for local and VdoCipher videos alike. Carried on `/admin/videos` (list and
detail), on `/admin/video-library`, and on `/admin/courses/<id>` for both the flat list
and each unit, because the course screen reads from there. Shown in the library details
drawer and as a chip in the course's ordered list.

### Browser guidance — the client chose the hard block
Decision (Dr. Mohamed Ghareeb, 2026-09-11): paid video plays only from protected
browsers or the app, with a screen that points to the right browser; free video plays
everywhere but still suggests a supported browser.

`GET /video/capabilities` runs the mint's browser rules, in the mint's order, on the
request's User-Agent and answers `{protected, blocked, platform}`. The web asks once per
page load (`lib/browserSupport.js`, fail-open) and:

- on a capture-protected video with `blocked` set, shows `BrowserGuidance` in the player
  slot **instead of minting** -- the reason, "open this in Safari/Edge/Chrome", copy-link,
  get-the-app;
- on a free video with `protected: false`, plays and adds a one-line nudge.

The block itself is the server's `strict_browser_policy`. It stays an admin switch and is
**not flipped in code**: the setup doc says to turn it on only after DRM is confirmed
working, because with FairPlay inactive it leaves Mac users no browser at all. Order:
confirm FairPlay, then Settings → Integrations → strict on. `mobile_requires_app` waits
for the apps to be in the stores.

### The IP pin was pinning to Cloudflare, not the viewer

Found on 2026-09-15, before the first paid course was published, and it would have broken
protected playback for every visitor.

DNS for baytara.app is proxied through Cloudflare, so the TCP peer nginx sees is a
Cloudflare edge address. `nginx` set `X-Real-IP $remote_addr` with no `real_ip`
configuration, so `trusted_request_ip()` returned Cloudflare's address and the `ipGeo` rule
pinned each OTP to *Cloudflare*. The viewer's own player then connects to VdoCipher from
their real address and is refused. It had never fired only because every published lesson
is self-hosted -- no VdoCipher OTP had been minted in production since the pin shipped.

Fixed in nginx rather than in the app: `deploy/nginx-cloudflare-realip.conf` lists
Cloudflare's published ranges with `real_ip_header CF-Connecting-IP`, included by each
Baytara server block. `$remote_addr` is then the real viewer everywhere, which also repairs
two things that had been silently wrong for longer than the pin: the IP burned into the
dynamic watermark, and the `ip_address` column of the playback audit trail. Other sites on
this host are untouched -- the include is scoped to the Baytara server blocks.

`deploy.sh` installs the snippet, and `deploy/nginx-baytara.conf` carries the include, so a
deploy cannot silently revert it. Cloudflare adds ranges occasionally; the file says so, and
the symptom is edge addresses reappearing in the access log.

Verified against production: a request through Cloudflare now logs the caller's real address,
and a denied playback attempt records that same address rather than an edge IP. Separately,
VdoCipher was checked to accept the OTP payload in all four combinations (plain, `ipGeo`
only, `whitelisthref` only, both), so the rules themselves are well-formed.

### Apple platforms need a certificate we do not have

VdoCipher answered the FairPlay question on 2026-09-15, and it contradicted the browser
policy this milestone shipped. Without a certificate: Widevine covers desktop and Android,
iOS gets proprietary encryption that is **not** a DRM, and **macOS Safari does not play at
all** -- their player tells the viewer to open Chrome.

Our rule did the opposite. `mac_without_safari()` refused Mac Chrome and named Safari, so a
Mac viewer was sent to a player that sent them back: a closed loop, and no way to watch.

`fairplay_enabled` (Settings, default off) now decides every Apple rule:

| | off (today) | on |
|---|---|---|
| macOS Safari | refused, `mac_needs_chrome` | allowed, capture-protected |
| macOS Chrome/Firefox | allowed, Widevine, not protected | refused, `mac_needs_safari` |
| iOS | not capture-protected | capture-protected |

The capabilities endpoint returns `recommend` so the page names the right browser rather
than guessing, because the answer inverts either side of the certificate.

**The consequence, stated plainly:** with `fairplay_enabled` off and `strict_browser_policy`
on, nothing on Apple qualifies as hardware DRM, so every Mac and iPhone is refused protected
video. Combined with `mobile_requires_app`, paid content is watchable on Windows Edge and
the Baytara app alone. That is the honest reading of the settings, not a regression -- and
it is the reason the certificate matters. Three ways out: apply for FairPlay, turn
`strict_browser_policy` off and accept unprotected desktop playback, or hold paid content
until the app ships.

The Apple Developer account this needs is the same one iOS bring-up needs (mobile-08), so
it is not an extra cost -- but Apple approval is slow and can be refused, so it is the
longest pole.

## Verification

Backend: `tests/test_video_provider.py` (wire payload), `tests/test_public_videos.py`
(pinning, app exemption, watermark id), `tests/test_admin_video_catalog.py` (both
refusals, counts on list/detail/course), `tests/test_video_capabilities.py` (every row of
the protection matrix, both switches). Web: `pages/learn.test.jsx` (block without a mint;
free plays with a nudge). Admin and web SPAs build.

Tests and the build must run as the `.env`/`node_modules` owner
(`sudo -u ahmeddiab ...`); see the session memory note.

## Still to do

- Read the live values of the two policy switches (Admin → Settings → Integrations).
- Confirm on the VdoCipher dashboard that FairPlay is active for the account.
- Flip `strict_browser_policy` on once FairPlay is confirmed (the client chose the block).
- Migrate the paid videos already on local storage (below).

## Migrating the old rows

`flask migrate-paid-videos` (`backend/app/services/video_migration.py`). The source file
is deleted after packaging, so the MP4 is rebuilt from the encrypted HLS with the key we
hold, uploaded through the same S3 form the admin SPA uses, and the row switched to
VdoCipher. Three steps, deliberately separate:

1. no flag -- list what would move, change nothing;
2. `--apply` -- rebuild, upload, switch the row; **the local package is kept**;
3. `--cleanup` -- delete a package only once `get_video()` reports the VdoCipher copy
   `ready`. A failed or half-processed upload never costs the only copy.

Run as the service user from `backend/` with the production env. Each migrated video is
unwatchable for the minutes VdoCipher takes to process it, the same as a fresh upload.
