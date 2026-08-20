# Baytara — بيطرة · Milestones Tracker

Legend: `[ ]` not started · `[~]` in progress · `[x]` done

Full technical plan: [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)

---

## Phase 1 — Main Website Front-end (React + Vite, mock data) → CLIENT APPROVAL GATE
> Standalone, clickable, RTL, responsive site with mock data. No backend. For client sign-off.

- [x] **1.0** Write repo docs: `docs/PROJECT_PLAN.md` + this `MILESTONES.md`
- [x] **1.1** Scaffold `frontend/web` (React + Vite + React Router)
- [x] **1.2** RTL + Arabic setup (`dir="rtl"`, `lang="ar"`), Tajawal font
- [x] **1.3** Theme tokens (accent `#e11b22`, ink/greys, gradient palette)
- [x] **1.4** Mock data (`src/data/mock.js`) mirroring the design's `renderVals()`
- [x] **1.5** Shared layout: top utility bar + sticky header (search/nav/avatar) + footer
- [x] **1.6** Page: Home (`/`)
- [x] **1.7** Page: Courses catalog (`/courses`) with filters
- [x] **1.8** Page: Course detail (`/courses/:slug`)
- [x] **1.9** Page: Instructor profile (`/instructors/:id`)
- [x] **1.10** Page: Pricing (`/pricing`) with monthly/annual toggle
- [x] **1.11** Page: Business (`/business`)
- [x] **1.12** Page: Auth (`/auth`) login/signup toggle
- [x] **1.13** Page: Student dashboard (`/dashboard`)
- [x] **1.14** New page: About (`/about`)
- [x] **1.15** New page: Blog + detail (`/blog`, `/blog/:slug`)
- [x] **1.16** New page: Free content (`/content`)
- [x] **1.17** New page: Contact (`/contact`)
- [x] **1.18** New page: Learn / video player mock (`/learn/:courseId/:lessonId`)
- [x] **1.19** Wire navigation (nav, course/mentor open, toggles, filters)
- [x] **1.20** Responsive pass (375 / 768 / 1240) + RTL correctness
- [x] **1.21** `npm run build` passes; deliver hostable static bundle
- [x] **1.22** ✅ Client approval received — Phase 1 signed off (2026-07-12)

## Phase 2 — Backend foundation
- [x] Flask app factory + config split (Dev/Prod) + `.env`
- [x] Docker Compose: PostgreSQL + MongoDB + Redis (`deploy/docker-compose.yml`)
- [x] SQLAlchemy + Alembic; base `User` model; `/api/v1/health`
- [x] Auth: register/login/logout/refresh, JWT access+refresh, RBAC, argon2 hashing
  - _note: bearer-JWT only; cookie sessions + Redis logout-denylist deferred to Phase 4_

## Phase 3 — Catalog + Learning APIs & wiring
- [x] Categories / courses / modules / lessons APIs (public read, filters, pagination)
- [x] Enrollments + progress + completion % (free enroll; paid deferred to Phase 4)
- [x] Replace Main Website mock data with real APIs — all public pages wired (Home, Courses, Course
  detail, Instructor, Blog+post, Content, Pricing, About, Contact) + settings-driven chrome
  (hero/about/footer/plans/faqs), mock fallback when API empty.
- [x] Student app wired: real login/register (JWT), Dashboard → my enrollments + progress %,
  Learn → real course content + mark-complete → progress, per-lesson progress persisted
  (`GET /progress?course=slug`, restored on reload). (Real DRM playback = Phase 5.)

## Phase 4 — Payments (InstaPay: receipt OCR + admin approval)
- [x] InstaPay account whitelist config (`instapay_account`) + admin CRUD
- [x] Receipt upload endpoint → save image → Google Vision OCR → parse fields (§8a)
- [x] Reference dedup (reject references already pending/approved) + receiver whitelist validation
- [x] `instapay_payments` pending record (image + parsed fields); NO direct acceptance
- [x] Admin review queue (API) → approve (atomic enroll + enrolled_count) / reject
- [x] OCR parser unit tests (fixtures) + approval-flow tests (mocked Vision)
- [ ] Manual refunds; invoices + instructor revenue (Phase 4b)
- [ ] Admin Portal UI for the review queue (Phase 7) + purchase-success notification (Phase 8)

## Phase 5 — VdoCipher video protection
- [x] Store `vdocipher_video_id` on lessons (admin-editable); no public URLs, `has_video` flag only
- [x] Backend access validation → OTP/playbackInfo (`POST /video/playback`, enrollment-gated,
  VideoProvider abstraction); Learn renders the VdoCipher iframe player
- [x] Dynamic watermark (viewer name/email/id baked into the OTP annotate)
- [ ] Watch logs → MongoDB (deferred — Mongo not provisioned; OTP issuance is already gated)
- _needs `VDOCIPHER_API_SECRET` in backend/.env to mint real OTPs (verified: gate works, returns no_api_key without it)_

## Phase 6 — Instructor Portal (Material Design 3) ✅
- [x] Login + dashboard; own courses/lessons (`frontend/instructor` at `/instructor/`, brand navy/gold)
- [x] Add-video permission-gated (can_add/edit/delete_video flags, admin-toggled); own students/revenue/stats
- [x] Strict `instructor_id` isolation — foreign course/module/lesson access → 404 (verified)

## Phase 7 — Admin Portal (Material Design 3)
- [x] InstaPay payment review queue (`frontend/admin`): login, list, view receipt, approve/reject
- [x] Dashboard (stats) + manage users/instructors/courses/categories/lessons + InstaPay accounts
- [x] Course lifecycle (draft/publish/unpublish/delete) + modules/lessons editor
- [~] Video: lesson `vdocipher_video_id` field editable; no upload UI yet (VdoCipher = Phase 5)
- [ ] Reports, instructor permissions, audit logs, settings (need new backend tables)

## Phase 8 — Notifications, content/blog, i18n scaffolding, hardening
- [x] Notifications (SQL) — emitted on payment approve/reject + admin broadcast (all/role); student API
  (list/unread-count/read/read-all, own-only) + header bell with unread badge. Mongo delivery-log deferred.
- [~] Free content / blog CMS — backend done (Article model, admin CRUD, public API); admin UI + site wiring pending
- [~] Site settings (hero/about/contact/socials/plans/faqs) + contact-message inbox — backend done
- [ ] i18n structure (Arabic default, multilingual-ready)
- [ ] Security hardening pass

## Phase 11 — Home page redesign (see `docs/milestones/`)
- [x] Learning paths backend — `learning_paths` + `path_courses`, public `/paths`, admin CRUD
- [x] Paths admin UI — ordered course picker in the admin portal
- [x] `GET /learning-summary` — real resume point, watched hours and streak, no new tables
- [x] Home copy moved into the settings CMS; `t()` gained `{placeholder}` interpolation
- [x] `/paths` and `/paths/:slug` pages + shared `PathCard`
- [x] `Home.jsx` rebuilt to the approved design on real data; home-page mock data deleted
- [x] Dark header, real footer links, phone tab bar
- [x] Course metadata — objectives, level, certificate flag, last-updated; per-course units
- [x] Course reviews — `course_reviews`, enrollment-gated posting, admin publish/hide
- [x] Course admin — units UI, meta fields, reviews moderation page
- [x] Course page rebuilt on real data; the mock-course fallback and its crash are gone
- [x] Lesson player rebuilt — real progress, unit-grouped curriculum, all-content browser
- [x] Profile page — cover/avatar upload, editable fields, real stats, derived activity
- [x] Certificates — issued on course completion, public verification at `/certificates/<serial>`
- [ ] Courses/videos listing redesigned to match
- [ ] Blog & consultations (the profile's consultations tile waits on this)

## Phase 9 — Deployment
- [x] NginX + HTTPS + security headers (HSTS, CSP, X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, Permissions-Policy; `server_tokens off`) — live: main site, `/admin`, `/api` proxy
- [x] Gunicorn backend service (`baytara-backend.service`, 127.0.0.1:8090, **8 workers**, gthread)
- [x] Health check (`/api/v1/health`)
- [x] Migrations on deploy — `deploy/deploy.sh` runs `flask db upgrade` (pull→deps→migrate→restart→build SPAs)
- [x] DB backups — `baytara-backup.timer` daily 02:30 (pg_dump→gzip→/var/lib/baytara/backups, keep 14)
- [ ] E2E + UAT → go-live

## Phase 10 — Mobile-readiness verification
- [ ] API/JWT audit for future iOS/Android
- [ ] OpenAPI spec published

## Phase 12 — Flutter app (Android + iOS)

A native app replacing the Capacitor shell in `mobile/`. Same API, no backend changes.
Plan and parity map: `docs/milestones/mobile-*.md`; API contract: `docs/FLUTTER_APP_PROMPT.md`.
Android first — iOS code is written but cannot be compiled on this Linux server.

- [x] mobile-00 Toolchain + skeleton — Flutter 3.47.0 + Android SDK installed, brand theme,
  Dio interceptor stack, route guards, ar/en RTL. 22 tests, analyze clean.
- [x] mobile-01 Auth + device binding + phone gate — email/Google/register, device-limit
  screen, mandatory phone gate, Android backup excluded so the device id cannot travel to a
  second handset. 43 tests. **Hardware checks still open: needs two physical phones.**
- [x] mobile-02 Catalogue — home, courses list with the full filter set and server facet
  counts, course detail, video library. Access rules derived in one place; `general` never
  offers a vet a purchase. 77 tests. Bundles/paths/instructors/articles deferred to after
  the player.
- [~] mobile-03 Player + capture guards — DRM playback, 15s heartbeat, watched-vs-covered
  telemetry, FLAG_SECURE + ALLOW_CAPTURE_BY_NONE, throttled suspicious reporting. Audio
  watermark round-trips against the backend decoder (`tool/verify_watermark.sh`). 118 tests.
  **Code complete but NOTHING verified on hardware; iOS never compiled. Watermark playback
  scheduling deferred to iOS bring-up.**
- [x] mobile-04 Learning + certificates — resume point, enrolments with progress,
  certificates and public verification. Free courses correctly produce no enrolment, and the
  empty state says so. 131 tests.
- [x] mobile-05 Payments (Android) — all four kinds, hosted gateway in a Custom Tab, App
  Links return, server-confirmed outcome. The redirect is never treated as proof of payment.
  iOS purchase decision deferred behind one flag. 147 tests.
  **Needs assetlinks.json published with the release fingerprint.**
- [x] mobile-06 Verification — three routes, three outcomes. 202 (human review) is its own
  screen that says do not resubmit, because a duplicate is refused. Byte progress then an
  honest elapsed counter for the 10-40s read. 159 tests.
- [x] mobile-07 Account + notifications + polish — notifications (60s poll, stopped when
  backgrounded), profile, settings, plus the bundles/instructors/articles screens deferred
  from mobile-02. No placeholder screens remain. 165 tests.
- [ ] mobile-08 iOS bring-up — **blocked: needs a Mac or hosted macOS runner**

**Backend gaps this surfaced** (none are client-side fixable):
- No password-reset endpoint.
- No account-deletion endpoint — App Store review will ask for one.
- No push infrastructure; notifications are a 60s poll.
- `mobile_requires_app` must be switched on only *after* the apps publish — it removes
  protected playback from mobile web entirely.
