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
- Any existing paid videos already on local storage: the new rule stops new ones, it does
  not migrate old ones. Count them with
  `select count(*) from lessons where source='local' and access_type in ('baytarian','general')`.
