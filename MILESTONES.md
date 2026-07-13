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

## Phase 6 — Instructor Portal (Material Design 3)
- [ ] Login + dashboard; own courses/lessons
- [ ] Add-video (permission-gated); own students/payments/revenue/stats
- [ ] Strict `instructor_id` isolation (foreign access → 404)

## Phase 7 — Admin Portal (Material Design 3)
- [x] InstaPay payment review queue (`frontend/admin`): login, list, view receipt, approve/reject
- [x] Dashboard (stats) + manage users/instructors/courses/categories/lessons + InstaPay accounts
- [x] Course lifecycle (draft/publish/unpublish/delete) + modules/lessons editor
- [~] Video: lesson `vdocipher_video_id` field editable; no upload UI yet (VdoCipher = Phase 5)
- [ ] Reports, instructor permissions, audit logs, settings (need new backend tables)

## Phase 8 — Notifications, content/blog, i18n scaffolding, hardening
- [ ] Notifications (SQL index + Mongo logs)
- [~] Free content / blog CMS — backend done (Article model, admin CRUD, public API); admin UI + site wiring pending
- [~] Site settings (hero/about/contact/socials/plans/faqs) + contact-message inbox — backend done
- [ ] i18n structure (Arabic default, multilingual-ready)
- [ ] Security hardening pass

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
