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
- [ ] Flask app factory + config split (Dev/Prod) + `.env`
- [ ] Docker Compose: PostgreSQL + MongoDB + Redis
- [ ] SQLAlchemy + Alembic; base models; `/api/v1/health`
- [ ] Auth: register/login/logout/refresh, JWT + sessions, RBAC, password hashing

## Phase 3 — Catalog + Learning APIs & wiring
- [ ] Categories / courses / modules / lessons APIs
- [ ] Enrollments + progress + completion %
- [ ] Replace Main Website mock data with real APIs

## Phase 4 — Payments (Paymob) + atomic transaction engine
- [ ] Gateway-agnostic payment layer + Paymob driver
- [ ] Checkout → pending payment (SQL)
- [ ] Webhook: HMAC verify + idempotency + atomic enroll/invoice/revenue
- [ ] Refunds; failed-payment handling

## Phase 5 — VdoCipher video protection
- [ ] Store `vdocipher_video_id`; no public URLs
- [ ] Backend access validation → OTP/playbackInfo
- [ ] Dynamic watermark; watch logs → MongoDB

## Phase 6 — Instructor Portal (Material Design 3)
- [ ] Login + dashboard; own courses/lessons
- [ ] Add-video (permission-gated); own students/payments/revenue/stats
- [ ] Strict `instructor_id` isolation (foreign access → 404)

## Phase 7 — Admin Portal (Material Design 3)
- [ ] Manage users/instructors/courses/categories/lessons
- [ ] Full video CRUD + course lifecycle
- [ ] Payments, reports, instructor permissions, audit, settings

## Phase 8 — Notifications, content/blog, i18n scaffolding, hardening
- [ ] Notifications (SQL index + Mongo logs)
- [ ] Free content / blog CMS
- [ ] i18n structure (Arabic default, multilingual-ready)
- [ ] Security hardening pass

## Phase 9 — Deployment
- [ ] NginX + HTTPS + security headers
- [ ] Gunicorn with 8 workers
- [ ] Migrations on deploy; health checks; backups
- [ ] E2E + UAT → go-live

## Phase 10 — Mobile-readiness verification
- [ ] API/JWT audit for future iOS/Android
- [ ] OpenAPI spec published
