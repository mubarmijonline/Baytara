# 13 — Profile page, certificates and activity

**Status:** done

## Goal

Build `Baytara Profile.dc.html`. The page existed only as a branch inside `Dashboard.jsx`
that rendered one phone field and the device list.

## Decisions taken before building

- **Certificates get built for real** — not a decorative section.
- **Consultations are deferred** to `Baytara Blog & Consultations.dc.html`, so the tile and tab
  the design shows for them are absent rather than faked.
- **Full self-serve editing** — cover, avatar, name, specialty, location, bio.
- **The activity feed is derived**, with no new table.

## Backend

`users` gained `cover_url` and `location`. `certificates` is new: `serial` (unique),
`user_id`, `course_id`, `issued_at`, unique on `(user_id, course_id)`.
Migration `e3b9d70c41f8_profile_and_certificates.py`.

| Endpoint | Note |
| --- | --- |
| `PATCH /auth/profile` | now takes `name`, `headline`, `location`, `bio` as well as `phone` |
| `POST /auth/profile/image` | learner's own avatar or cover |
| `GET /certificates` | the caller's certificates |
| `GET /certificates/<serial>` | **public** verification |
| `GET /activity` | derived feed, `?limit=` capped at 50 |

### Security notes on the upload

This is a new trust boundary — the first endpoint where a non-admin writes a file.

- **The target is always the caller.** There is no `user_id` parameter, so the endpoint cannot
  be pointed at another account's avatar.
- **The stored filename is generated** (`u<id>_<kind>_<random><ext>`), never taken from the
  upload, so a crafted name cannot traverse out of the folder or collide with someone else's
  file. A test posts `../../etc/passwd.png` and asserts the result.
- **Type comes from the mimetype allow-list**, size from measuring the stream rather than
  trusting `Content-Length`; over 5 MB is a 413.
- **Unknown fields are ignored, not applied.** A PATCH carrying `role` or `email` returns 200
  with neither changed — a test asserts the role stays `student`.
- **Phone is still required whenever it is sent.** It drives the video watermark, so an empty
  one would quietly weaken content protection; editing a bio no longer touches it either way.

### Certificates

`issue_certificate_if_earned` runs on `POST /progress`. It awards one only when the course has
`has_certificate` set and completion is 100%, and it is idempotent — re-completing a lesson
returns the existing row rather than minting a second.

Verification exposes the learner's name, the course and the serial. No email, no user id.

### Activity

Merged from lesson completions, certificates and paid payments — three things already
recorded — and sorted newest first. `ponytail:` a `user_activity` table would have to be kept
in step with all three writers.

## Frontend

`pages/Profile.jsx` replaces the Dashboard branch at `/dashboard/profile`: cover and avatar
pickers, identity header with the verification badge, three real stat tiles, the editable
account form, the activity feed and the certificate cards. `pages/Certificate.jsx` serves
`/certificates/:serial`.

**«تحميل PDF» prints the page rather than adding a PDF library.** A `@media print` block drops
the site chrome, so the browser's own print-to-PDF produces the certificate — and the same URL
is the verification link. No new dependency.

### The regression this caught

The old page carried a flow the design does not show: a viewer with no phone on file is sent to
`/dashboard/profile?next=/videos/2`, adds their phone, and is returned to the video. The first
cut of the rebuild dropped it and `auth-security.test.jsx` failed. It is back as `PhoneGate` —
when `?next=` is present the page renders the focused phone step instead of the full editor,
which is also the better experience for someone interrupted mid-video.

## What the design shows that this does not

The consultations tile and tab, and the six-tab strip — the tabs collapse into one page for now,
with certificates and courses as sections.

## Acceptance check

```bash
cd /development/projects/baytara/backend && .venv/bin/python -m tests.test_profile
```

```bash
cd /development/projects/baytara/frontend/web && npm run test
```
