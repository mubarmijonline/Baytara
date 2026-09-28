# Baytara — implementation plan

The master technical plan is `docs/PROJECT_PLAN.md`; the delivery record is
`MILESTONES.md` at the repo root and one file per milestone under `docs/milestones/`.
This file holds the plan for the work currently in flight.

---

## Delivered, milestone 24: pinning past four, and the national ID optional

See `docs/milestones/24-pinning-fix-and-optional-national-id.md`. Pinning a fifth video
no longer wipes the first four: the save now clears ranks through the loaded rows, so a
video that keeps its place is not silently dropped. Verified live by adding a fifth to the
client's four and restoring them. Verification no longer needs a typed national ID on any
route: the syndicate card records the number printed on it instead, and the website marks
the field optional and never blocks the upload.

---

## Delivered, milestone 23: admin tests green again, and milestone 22 in the app

See `docs/milestones/23-admin-tests-and-app-parity.md`. The app home gained the
"تعرّف على المنصة" strip in pinned order, and its vet-only lock now shows the website's
sentence and "توثيق الحساب الآن" button. The admin suite passes again (109 tests, about
80 s; it used to hang). Two real bugs were behind it, both fixed: the video editor
remounting itself after its silent poster repair, and the upload queue not resuming
after a refused paid tier was corrected. The rest were tests that predated deliberate
changes.

---

## Delivered, milestone 22: pinned videos and the vet-only lock

See `docs/milestones/22-pinned-videos-and-vet-gate.md`. `lessons.library_rank` puts up to
twelve admin-chosen videos first in the public library, the app's list and (for videos with
no section) the home page strip; an admin panel at the top of the video library sets the
order. A vet-only video now tells a signed-in viewer "وثّق حسابك كطبيب بيطري للمشاهدة" with a
"توثيق الحساب الآن" button to verification, on the website and in the app.

The admin test failures found here predated this milestone and were fixed in
milestone 23.

---

## Delivered — milestone 16: Kashier readiness and homepage motion

See `docs/milestones/16-kashier-and-homepage-motion.md`. Short version: the Kashier
integration is written, tested and dark. It turns itself on the moment three Setting rows
(`secret_kashier_merchant_id`, `secret_kashier_secret`, `secret_kashier_api_key`) are
saved in the admin portal under Integrations — no deploy, no migration, no restart. Until
then `GET /payment/gateway` reports `ready: false` and checkout falls back to Fawaterak,
or answers 503 if that is unconfigured too, which it is.

The one thing Kashier needs from us to approve the account is the public site showing
real courses at real prices, which it already does.

Homepage motion is compositor-only (transform and opacity), library-free, and fully
disabled under `prefers-reduced-motion`.

---

## In flight — milestone 15: admin portal navigation and dashboard refresh

See `docs/milestones/15-admin-dashboard-refresh.md` for the goal and the acceptance
check. This is the how.

### The constraint that shapes everything

Nothing may be removed. Every destination, every link target with its query string,
every badge and every figure that existed before must still exist afterwards, in
Arabic and in English. The refresh is about weight, order and reachability, not about
what the portal can do.

Two invariants make that testable and are easy to break by accident:

1. **One link per accessible name.** `tests/routing.test.jsx` reaches each destination
   with `getByRole('link', { name })`, which throws when two elements match. The
   dashboard's figure labels are deliberately written without the definite article
   (`فئات`, not `الفئات`) so they never collide with the sidebar's (`الفئات`). New copy
   must keep that apart: quick actions are singular (`دورة جديدة`, `مقال جديد`), never
   a restatement of a navigation label.
2. **One heading per page title.** The same tests assert the page heading with
   `getByRole('heading', { name })`. Shell chrome that persists across navigation —
   the sidebar's group titles, for instance — must therefore not be a heading. They are
   `aria-hidden` labels on a `role="group"`, which reads correctly and competes with
   nothing.

### Navigation (`src/Shell.jsx`)

- Seventeen flat destinations become four groups, in the order of an admin's day:
  **today's desk** (dashboard, payments, verification, messages), **content**
  (courses, videos, upload, bundles, paths, categories, hierarchy, articles),
  **people** (enrollments, users, instructors, reviews), **system**
  (video monitoring, site settings).
- `paths` joins the sidebar. Its routes have always worked; the only way in was a
  single dashboard tile.
- Unread messages get a count beside the destination, the way payments and
  verification already did.
- A quick-search palette on `Ctrl/Cmd + K` and on a labelled button, because
  seventeen destinations is past the number anyone scans reliably. The button is
  there for the admin who does not know the shortcut exists.
- The sidebar becomes a sticky full-height column with its own scroll, collapsible to
  an icon rail (remembered in `localStorage`), and a real drawer below 900px instead of
  seventeen wrapped chips.

### Dashboard (`src/pages/Dashboard.jsx`)

Ordered as the morning is, rather than as the data happens to group:

1. **What is waiting.** The five queues, sorted by size, each one row with its count,
   what it is, and a way in. When every queue is clear it is one sentence, not five
   tiles reading zero. The cleared queues keep their links in a compact strip — a
   cleared queue is still somewhere an admin goes to look.
2. **What to start.** New course, video, article, bundle, path — the five creates that
   have real routes.
3. **What we earned.** Revenue leads at headline size; the four payment statuses sit
   under it as compact figures instead of four tiles of their own.
4. **Everything else**, as three dense panels of label-and-number rows: learners,
   content, accounts. Every row is still a link to the rows it counts.
5. **Storage**, unchanged in substance, moved to the bottom where reference belongs,
   with the disk headroom promoted into the figures instead of a footnote.

A refresh control re-reads both `/admin/stats` (through the existing
`baytara:admin-stats-changed` event, so the sidebar counts move with it) and
`/admin/storage`.

### Not touched

- No backend change. The dashboard draws only what `/admin/stats` and `/admin/storage`
  already return.
- The other twenty pages keep their own headings and toolbars; they inherit the shell
  and the refreshed shared styles only.
- `src/pages/Accounts.jsx` has no route and no import anywhere in the app. It is dead
  code today and is left dead deliberately: wiring it in is a feature decision.
