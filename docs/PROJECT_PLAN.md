# Baytara — بيطرة · Full Technical & Implementation Plan

## Context

**Baytara** is an Arabic-first (RTL) educational & advisory web platform for veterinarians, veterinary
students, livestock owners, and veterinary-learning enthusiasts. The current engagement builds the
**web platform only**, but the backend must be **API-driven** so future Android/iOS apps connect to the
same backend/DB with no rewrite.

The repo currently contains only two saved design systems (no app code yet):
- `design-systems/baytara/` — the 8-page RTL Main Website design (font **Tajawal**, accent **`#e11b22`**).
- `design-systems/material-design-3/` — an M3 component gallery + `--md-*` color tokens, for the two portals.

Environment confirmed: Python 3.12, pip, Node 24, npm, Docker, and `pg_config` are installed;
no DB servers are running yet. Remote: `github.com/mubarmijonline/Baytara` (branch `main`).

**Locked decisions (from the user):**
1. Front-end = **React SPA (Vite)** for the Main Website and both portals.
2. SQL source of truth = **PostgreSQL**.
3. Payment gateway = **Paymob first**, behind a gateway-agnostic abstraction.
4. **Phase 1 = Main Website front-end with mock/static data**, shipped standalone for **client approval** before any backend work.

> This document is the master plan. On approval, its content is copied into the repo as
> **`docs/PROJECT_PLAN.md`** and a companion **`MILESTONES.md`** (checkbox tracker) is created at repo root.
> Each milestone/step is marked `[ ]` / `[~]` (in progress) / `[x]` (done) and updated as work proceeds.

---

## 1. Project understanding summary

A subscription/purchase-based e-learning platform with three surfaces sharing one Flask REST backend and
one PostgreSQL database (plus MongoDB for high-volume non-financial logs):

- **Main Website** — public + student experience (browse, buy, learn, watch DRM-protected video).
- **Instructor Portal** — per-instructor isolated dashboard (own courses/students/revenue only).
- **Admin Portal** — full platform management, financial oversight, permissions, video control.

Hard rules driving the architecture:
- **All money logic lives in SQL only**, executed as **atomic transactions** (no half-enrollments, no
  access before confirmed payment, no duplicate payments).
- **MongoDB only for high-volume non-financial records** (watch logs, activity, notifications, audit events).
- **Instructor data isolation** enforced on every query by `instructor_id`.
- **Video protection via VdoCipher DRM** — backend validates access, then issues short-lived OTP/playback tokens; no public video URLs.
- **Arabic/RTL by default**, structured for later multilingual (i18n) activation.

---

## 2. Main modules

1. **Auth & Identity** — registration, login, sessions + JWT (for API/mobile), RBAC, password hashing.
2. **Catalog** — categories, courses, lessons/classes, attachments, instructor linkage.
3. **Learning** — enrollments, progress tracking, video playback (VdoCipher), completion %.
4. **Payments & Finance** — checkout, Paymob integration, atomic transaction engine, invoices, wallet/revenue, refunds.
5. **Instructor** — isolated dashboards, own-course management, add-video (permission-gated), own revenue/stats.
6. **Admin** — user/course/video/content management, permissions, financial reports, audit.
7. **Content/CMS** — free advisory content, blog/awareness articles.
8. **Notifications** — events → user notifications (SQL index + MongoDB log).
9. **Logging/Audit** — MongoDB high-volume logs; critical audit mirrored to SQL.
10. **Reporting** — sales, course revenue, instructor revenue, failed payments, engagement.
11. **Platform/Settings & i18n** — global settings, feature flags, locale.

---

## 3. User roles

| Role | Scope |
|---|---|
| **Guest/Visitor** | Public pages, free content, register/login. |
| **Student** | Own profile, purchased/assigned courses, progress, protected video, payment history, notifications. |
| **Instructor** | Only their own courses/lessons/students/payments/revenue/stats; add video (edit/delete only if flagged). |
| **Admin** | Full platform control: users, courses, videos, content, payments, reports, permissions, settings, audit. |
| *(future)* **Super-Admin/Support** | Optional finer-grained admin split; RBAC designed to allow it later. |

RBAC = roles + granular permission flags (esp. instructor `can_add_video` / `can_edit_video` / `can_delete_video`).

---

## 4. Full feature list

### 4A. Main Website (public + student)
Home; About platform; Courses listing; Course categories; Course details; Instructor profile; Free
advisory content; Blog/awareness articles; Student register/login/logout; Student profile edit;
My Courses; Continue watching; Progress tracking; Protected video watch page; Course purchase/subscription
flow; Paymob checkout; Payment history; Contact; Notifications; **fully responsive** (mobile/tablet/desktop);
**Arabic RTL** by default.

**Course fields:** title, description, image, price, instructor, category, lessons, protected videos,
attachments, duration, enrolled-students count, status, per-student completion %.

**Design → routes (from the Baytara `.dc.html`, 8 page states):**
`isHome→/`, `isCourses→/courses`, `isDetail→/courses/:slug`, `isInstructor→/instructors/:id`,
`isPricing→/pricing`, `isBusiness→/business`, `isAuth→/auth`, `isDashboard→/dashboard` — plus new
`/about`, `/blog`, `/blog/:slug`, `/content`, `/contact`, `/dashboard/my-courses`, `/learn/:courseId/:lessonId`,
`/dashboard/payments`, `/dashboard/profile`.

### 4B. Instructor Portal (Material Design 3)
Login; dashboard; view assigned/own courses; view own lessons; **add** videos to own courses; view own
enrolled students; view own-course payments; view own-course revenue; basic course stats; per-student
progress for own courses. Add-video gated by permission flags. **Every view scoped by `instructor_id`.**

### 4C. Admin Portal (Material Design 3)
Login; dashboard overview; manage students/instructors/courses/categories/lessons/videos; manage free
content & articles; manage payments/purchases/subscriptions; reports; notifications; platform settings;
roles & permissions; instructor permissions; total sales; course sales; instructor revenue; gateway
transactions; failed payments; audit logs; full video CRUD; full course lifecycle (create/edit/publish/
unpublish/delete); full user control. **Admin instructor management:** create instructor, assign courses,
view instructor courses/revenue, toggle permission flags, enable/disable account.

---

## 5. Database architecture

- **PostgreSQL** = single source of truth for identity, catalog, enrollments, progress, and **all finance**.
  Accessed via **SQLAlchemy** + **Alembic** migrations. Finance uses `SERIALIZABLE`/`REPEATABLE READ`
  transactions + row locks + idempotency keys.
- **MongoDB** = high-volume, non-financial, append-mostly logs only.
- **Redis** (recommended, add in backend phase) = sessions/JWT denylist, rate limiting, Paymob idempotency
  locks, caching. (Not yet installed; provisioned via Docker Compose.)
- **Never** place financial records in MongoDB.

```
[React SPA: Web / Instructor / Admin]  +  [future iOS/Android]
                     │  HTTPS REST (+JWT)
                 [NginX]  →  [Gunicorn, 8 workers]  →  [Flask API]
                     ├── PostgreSQL  (identity, catalog, learning, FINANCE)
                     ├── MongoDB     (watch/activity/notification/audit logs)
                     ├── Redis       (sessions, rate-limit, idempotency, cache)
                     └── VdoCipher   (DRM OTP/playback)   + Paymob (payments)
```

---

## 6. SQL tables proposal (PostgreSQL)

**Identity & RBAC:** `users` (id, name, email unique, password_hash, role, locale, is_active, created_at),
`roles`, `permissions`, `role_permissions`, `instructor_profiles` (user_id, bio, expertise,
`can_add_video` bool default **true**, `can_edit_video` bool default **false**, `can_delete_video` bool
default **false**, is_enabled), `student_profiles`, `sessions`/`refresh_tokens`.

**Catalog:** `categories`, `courses` (id, title, slug, description, image, **price**, currency, `instructor_id`
FK, `category_id` FK, duration, status[draft/published/unpublished], enrolled_count, created_at),
`course_modules` (units), `lessons` (module_id, title, order, duration), `videos` (lesson_id,
`vdocipher_video_id`, title, order, is_protected), `attachments` (lesson_id/course_id, file, type).

**Learning:** `enrollments` (id, user_id, course_id, source[purchase/assigned], status, enrolled_at,
UNIQUE(user_id,course_id)), `lesson_progress` (enrollment_id, lesson_id, watched_seconds, completed_at),
`course_progress` (enrollment_id, percent) or computed.

**Finance (SQL only):** `payments` (id, user_id, course_id, amount, currency, status[pending/paid/failed/
refunded], gateway, gateway_ref, **idempotency_key** unique, created_at), `payment_transactions` (ledger:
payment_id, type[charge/refund/payout], amount, balance_after, created_at), `invoices` (payment_id,
number unique, pdf_url, issued_at), `course_purchases` (user_id, course_id, payment_id, price_paid),
`subscriptions` + `subscription_plans` (optional), `instructor_revenues` (instructor_id, course_id,
payment_id, gross, commission_rate, net), `wallets` + `wallet_transactions` (optional payout),
`refunds` (payment_id, amount, reason, status), `payment_webhook_logs` (gateway, event_id unique,
raw_payload, signature_valid, processed_at) — **also SQL** (webhook idempotency is financial-critical).

**Content/Platform:** `articles`/`free_content` (title, slug, body, cover, status, author_id),
`notifications` (user_id, type, title, body, is_read, created_at — SQL index for “my notifications”;
bulk delivery logs go to Mongo), `audit_logs_critical` (actor_id, action, entity, entity_id, meta,
created_at — mirror of high-value admin actions), `settings` (key/value), `contact_messages`.

Indexes on all FKs, `courses.instructor_id`, `enrollments(user_id,course_id)`, `payments.status`,
`payments.idempotency_key`, `payment_webhook_logs.event_id`.

---

## 7. MongoDB collections proposal (non-financial, high-volume)

`video_watch_logs` (user_id, course_id, lesson_id, vdocipher_id, position, duration, event, ts) ·
`activity_logs` (user_id, action, path, ip, ua, ts) · `notification_logs` (delivery/read stream) ·
`audit_events` (verbose audit stream; critical subset mirrored to SQL) · `tracking_events`
(page/impression/funnel) · `search_logs`. All append-mostly, TTL indexes where appropriate.
**No money data ever.**

---

## 8. Payment transaction algorithm (atomic, Paymob)

**Design goals:** exactly-once, no access-before-payment, full rollback on any failure, idempotent webhooks.

**Checkout (client → backend):**
1. Student selects course → `POST /api/payment/checkout {course_id}`.
2. Backend validates course is published & not already enrolled.
3. **SQL tx:** insert `payments` row `status=pending` with a generated **`idempotency_key`**; commit.
4. Call Paymob (auth → order → payment key) using that key; return `payment_token`/iframe URL to client.
5. Client completes payment on Paymob.

**Webhook/callback (Paymob → backend) — the atomic core:**
1. `POST /api/payment/webhook` → **verify HMAC signature** (reject if invalid).
2. Insert into `payment_webhook_logs` keyed by gateway `event_id`; if duplicate → **return 200, do nothing** (idempotent).
3. Acquire lock on the `payments` row (`SELECT … FOR UPDATE`) / Redis idempotency lock.
4. If payment already `paid` → return 200 (no double-processing).
5. **Begin single SQL transaction** (REPEATABLE READ+):
   a. Mark `payments.status = paid` (verify gateway amount == expected).
   b. Insert `payment_transactions` ledger entry.
   c. Insert `enrollments` (source=purchase) — UNIQUE guard prevents duplicates.
   d. Insert `invoices` (+ number), `course_purchases`.
   e. Insert/Update `instructor_revenues` (gross/commission/net) and increment `courses.enrolled_count`.
   f. Insert `notifications` (purchase success).
   **COMMIT.** Any exception → **ROLLBACK** (nothing persists; payment left pending/failed for retry).
6. Post-commit (non-financial, best-effort): Mongo activity log, email/notification dispatch.
7. **Access granted only after step 5 commit.** Course access checks require an active `enrollments` row.

**Refunds:** admin action → Paymob refund → on confirmation, SQL tx writes `refunds` + reversing
`payment_transactions` + revoke/flag `enrollments`.

---

## 9. Instructor isolation logic

- Every instructor-owned entity carries ownership: `courses.instructor_id`; lessons/videos/attachments
  reachable only through their course.
- **Enforced centrally**, not per-endpoint: a `@require_role('instructor')` + an ownership guard/query
  scope that injects `WHERE instructor_id = current_user.instructor_id` (SQLAlchemy query helper
  `owned_by_current_instructor(model)`), applied to every instructor read/write.
- Students/payments/revenue queries join through `courses` filtered by `instructor_id`.
- Any attempt to access another instructor’s resource → **404** (not 403, to avoid existence disclosure).
- Instructors never receive global-revenue or admin-report endpoints (separate API namespace + role gate).
- Automated tests assert cross-instructor access returns 404 for every instructor route.

---

## 10. Instructor video permission logic

Flags on `instructor_profiles`: `can_add_video=true`, `can_edit_video=false`, `can_delete_video=false` (defaults).

- **Add video:** allowed if `can_add_video` AND instructor owns the target course. Instructor supplies
  VdoCipher video id / uploads → creates `videos` row on own lesson.
- **Edit / Delete video:** allowed only if the respective flag is true **and** ownership holds; otherwise 403.
- **Admin** always has full video CRUD + structure management + approve/remove, regardless of flags.
- Admin endpoint `PATCH /api/admin/instructors/:id/permissions` toggles flags (audited).
- Enforced by a `@require_permission('edit_video')`-style decorator that reads the instructor’s flags.

---

## 11. VdoCipher integration plan

- Store only `vdocipher_video_id` on `videos`; **no public/raw video URLs** anywhere.
- Playback: client requests `POST /api/video/playback {lesson_id}` → backend (a) verifies an active
  `enrollments` row for that course, (b) calls VdoCipher OTP API to mint a **short-lived OTP + playbackInfo**,
  (c) returns them to the client player. Backend is the sole authority for access.
- **Dynamic watermark:** pass viewer identity (name/email/user_id + timestamp) as annotation params to the
  OTP request when the provider supports it.
- Every playback issuance logged to Mongo `video_watch_logs`; watch progress posted back to update
  `lesson_progress`.
- VdoCipher API key stored in `.env` (server-side only). Subscription cost is out of scope.
- Abstracted behind a `VideoProvider` interface so the DRM vendor can be swapped.

---

## 12. API structure (REST, `/api/v1`, JSON, JWT for mobile + cookie session for web)

- **Auth:** `POST /auth/register|login|logout|refresh`, `GET /auth/me`, `POST /auth/forgot|reset`.
- **Student:** `GET/PATCH /students/me`, `GET /students/me/courses`, `GET /students/me/payments`,
  `GET /students/me/notifications`.
- **Course (public):** `GET /courses`, `GET /courses/:slug`, `GET /categories`, `GET /instructors/:id`,
  `GET /content`, `GET /articles`.
- **Learning:** `GET /enrollments`, `POST /progress`, `POST /video/playback`.
- **Instructor:** `/instructor/dashboard|courses|courses/:id/lessons|videos(POST)|students|payments|revenue|stats` (all isolated).
- **Admin:** `/admin/users|instructors|courses|categories|lessons|videos(CRUD)|content|payments|reports|settings|permissions|audit`.
- **Payment:** `POST /payment/checkout`, `POST /payment/webhook`, `GET /payment/:id/status`, `POST /admin/payments/:id/refund`.
- **Video:** `POST /video/playback`, admin video CRUD under `/admin/videos`.
- **Notification:** `GET /notifications`, `POST /notifications/:id/read`, `POST /admin/notifications` (broadcast).
- **Reporting:** `/admin/reports/sales|courses|instructors|failed-payments`.

Cross-cutting: pagination, filtering, consistent error envelope, request-id, OpenAPI/Swagger doc,
versioned prefix so mobile can pin a version. Same APIs serve web SPA + future iOS/Android.

---

## 13. Folder structure

```
Baytara/
├── docs/
│   ├── PROJECT_PLAN.md          # this plan (copied on approval)
│   └── api/                      # OpenAPI spec
├── MILESTONES.md                # checkbox tracker (root)
├── design-systems/              # existing saved designs (source of truth for UI)
│   ├── baytara/                 #   → Main Website look
│   └── material-design-3/       #   → portals look + --md-* tokens
│
├── frontend/                    # Phase 1 deliverable
│   ├── web/                     # React+Vite — Main Website (RTL, Tajawal, #e11b22)
│   │   ├── src/{pages,components,layouts,routes,data(mock),theme,i18n,lib}
│   │   └── index.html, vite.config.js
│   ├── admin/                   # React+Vite — Admin Portal (M3 tokens)  [later phase]
│   ├── instructor/              # React+Vite — Instructor Portal (M3)     [later phase]
│   └── shared/                  # shared UI kit, api-client, types, i18n   [later phase]
│
├── backend/                     # Flask API                               [later phase]
│   ├── app/
│   │   ├── __init__.py (app factory), config.py, extensions.py
│   │   ├── api/v1/{auth,students,courses,learning,instructor,admin,payment,video,notification,reporting}/
│   │   ├── models/  (SQLAlchemy: identity, catalog, learning, finance)
│   │   ├── services/ (payment_service, video_provider, revenue_service, notification_service)
│   │   ├── repositories/ (query scopes incl. instructor isolation)
│   │   ├── mongo/  (log collections), security/ (rbac, jwt, hashing, decorators)
│   │   └── utils/
│   ├── migrations/ (Alembic), tests/, wsgi.py, requirements.txt
│
├── deploy/
│   ├── docker-compose.yml (postgres, mongo, redis, api, nginx)
│   ├── nginx/baytara.conf, gunicorn.conf.py (8 workers), Dockerfile(s)
├── .env.example, .gitignore, README.md
```

---

## 14. Security plan

- **AuthN:** Argon2/bcrypt password hashing; secure HTTP-only SameSite cookies for web sessions; **JWT
  access + refresh** for API/mobile; refresh rotation + Redis denylist on logout.
- **AuthZ:** RBAC (Admin/Instructor/Student) + permission flags; central decorators
  `@require_role`, `@require_permission`, instructor ownership scope (§9/§10).
- **Transport:** HTTPS everywhere; HSTS; secure headers (CSP, X-Frame-Options, etc.) at NginX.
- **CSRF:** protection on cookie-based state-changing routes; JWT (bearer) endpoints exempt.
- **Input/file validation:** schema validation (marshmallow/pydantic) on every endpoint; upload type/size
  checks, stored outside webroot, filename sanitization, content-type allowlist.
- **Payments:** webhook **HMAC signature verification**, amount re-verification, idempotency keys,
  server-side-only verification, never trust client for “paid”.
- **Video:** access validated server-side before OTP issuance; no raw URLs; short-lived tokens; dynamic watermark.
- **Rate limiting** (Redis) on auth, checkout, webhook; **audit logs** for admin/financial actions
  (SQL critical + Mongo verbose); secrets only in `.env`; least-privilege DB users; parameterized queries (ORM).

---

## 15. Deployment plan (Flask + NginX + 8 workers)

- **Gunicorn** with **8 workers** (`gunicorn -c deploy/gunicorn.conf.py wsgi:app`, `workers=8`,
  `worker_class=gthread` or `uvicorn` if async needed; timeouts + graceful reload).
- **NginX** reverse proxy: TLS/HTTPS termination, HTTP→HTTPS redirect, HSTS + security headers, gzip,
  static/SPA hosting (serves built `frontend/web` etc.), proxy `/api` → Gunicorn, client-max-body-size for uploads.
- **PostgreSQL / MongoDB / Redis** as services (Docker Compose for dev; managed or containerized for prod).
- **Config split:** `.env` driven; `DevelopmentConfig` vs `ProductionConfig`; separate DB creds; debug off in prod.
- **Migrations:** Alembic on deploy. **Process:** build SPAs → collect to NginX → run migrations → start Gunicorn.
- Health checks (`/api/v1/health`), structured logging, backups for PostgreSQL. (No hosting/pricing details per instructions.)

---

## 16. Development phases

> **Phase 1 is front-end only (mock data) for client approval — nothing else starts until it is signed off.**

- **Phase 1 — Main Website Front-end (React+Vite, mock data) → CLIENT APPROVAL GATE.**
  All 8 Baytara pages + added routes (about/blog/content/contact/learn), RTL, Tajawal, accent `#e11b22`,
  fully responsive, mock JSON, clickable navigation. Deliver a runnable/hostable static build.
- **Phase 2 — Backend foundation.** Flask app factory, config split, PostgreSQL+SQLAlchemy+Alembic,
  Docker Compose (pg/mongo/redis), health check, base models, auth (register/login/JWT/RBAC).
- **Phase 3 — Catalog + Learning APIs & wiring.** Courses/categories/lessons; enrollments; progress;
  connect Main Website to real APIs (replace mock).
- **Phase 4 — Payments (Paymob) + atomic transaction engine + invoices + revenue + refunds.**
- **Phase 5 — VdoCipher video protection** (OTP, access validation, watermark, watch logs → Mongo).
- **Phase 6 — Instructor Portal** (M3) with strict isolation + video-add permissions.
- **Phase 7 — Admin Portal** (M3): full management, permissions, reports, audit, video CRUD.
- **Phase 8 — Notifications, content/blog, i18n scaffolding, hardening.**
- **Phase 9 — Deployment** (NginX + Gunicorn 8 workers, HTTPS), E2E, UAT, go-live.
- **Phase 10 — Mobile-readiness verification** (API/JWT audit for iOS/Android).

Each phase = a set of `MILESTONES.md` checkboxes, marked as completed.

---

## 17. Testing plan

- **Backend unit:** models, services, RBAC, instructor-isolation scope, permission flags.
- **Payment/finance (critical):** atomic commit/rollback, duplicate-webhook idempotency, no-access-before-paid,
  amount tampering rejected, refund reversal — with a Paymob **sandbox** + mocked webhooks.
- **API/integration:** every endpoint (authz matrix: student/instructor/admin), cross-instructor access → 404.
- **Video:** playback denied without enrollment; OTP issuance mocked; watermark params present.
- **Frontend:** component tests + Playwright E2E on key flows (browse→buy→learn, login, dashboards);
  **RTL/responsive** visual checks at mobile/tablet/desktop breakpoints.
- **Security:** authz tests, input/file-validation, rate-limit, CSRF, headers; dependency scan.
- **CI:** run lint + tests on push; migrations apply cleanly on a fresh DB.

---

## 18. MVP scope

**In:** Main Website (all core pages), student auth, browse/catalog/course detail/instructor profile,
purchase via **Paymob** with the **atomic transaction** flow, enrollment + access control,
**VdoCipher** protected playback, progress/completion, My Courses, payment history, notifications
(basic), **Instructor Portal** (isolated: own courses/students/revenue + add-video), **Admin Portal**
(users/courses/categories/lessons/**video CRUD**/payments/instructor permissions/basic reports/audit),
Arabic RTL, responsive, deployed behind NginX+Gunicorn(8).

**Deferred (post-MVP):** subscriptions/wallet payouts, multilingual activation, advanced analytics,
Fawry driver, blog CMS depth, refunds UI polish, mobile apps.

---

## 19. Future mobile app preparation

- **API-first** `/api/v1` with **JWT access+refresh** (already the auth path for non-web clients).
- Versioned, documented (OpenAPI) endpoints; stable JSON contracts; pagination/filtering conventions.
- No web-only assumptions in business logic; sessions optional (cookie for web, bearer for mobile).
- VdoCipher OTP flow works identically for native players; Paymob flow returns tokens usable by mobile SDKs.
- Push-ready notification model (server stores + can dispatch to future FCM/APNs).
- Same PostgreSQL/Mongo backend — mobile apps add only a client, **no backend rewrite**.

---

## 20. Risks & important notes

- **Financial integrity is the highest risk** → enforced by SQL-only + atomic tx + idempotency +
  webhook signature + amount re-verification; covered by dedicated tests.
- **Instructor data leakage** → central ownership scope + 404-on-foreign + automated isolation tests.
- **Video piracy** → server-validated OTP, no raw URLs, short-lived tokens, watermark; never expose keys.
- **Webhook duplication/spoofing** → `payment_webhook_logs` idempotency + HMAC verification.
- **Paymob/VdoCipher are external** → abstract behind interfaces; sandbox first; handle timeouts/retries; costs out of scope.
- **RTL/Arabic correctness** → RTL-first CSS, logical properties, i18n structure even for Arabic-only launch.
- **No DB servers/Redis running yet** → provisioned via Docker Compose in Phase 2 (pg_config already present).
- **Design fidelity** → Main Website must follow saved Baytara design; portals must follow saved M3 tokens/gallery — no substitutions.
- **Secrets** → `.env` only, never committed; `.env.example` provided.

---

## Phase 1 execution detail (the immediate next step after approval)

**Goal:** a clickable, responsive, RTL Main Website (mock data) for **client approval** — no backend.

1. Create repo docs: write `docs/PROJECT_PLAN.md` (this file) + `MILESTONES.md` (checkbox tracker) and mark items.
2. Scaffold `frontend/web` — React + Vite, React Router, RTL setup (`dir="rtl"`, `lang="ar"`), Tajawal font,
   theme with accent `#e11b22` and the design’s gradient palette.
3. Build shared layout (top utility bar, sticky header with search/nav, footer) from the Baytara design.
4. Build pages as routes with mock JSON mirroring the design’s `renderVals()` data
   (courses, categories, instructors, plans, faqs, testimonials, dashboard): Home, Courses, Course Detail,
   Instructor, Pricing, Business, Auth, Dashboard, + About, Blog/Blog detail, Free Content, Contact, Learn (player mock).
5. Wire navigation (goHome/goCourses/openCourse/openMentor/pricing toggle/auth toggle/filters) as real routes/state.
6. Ensure responsiveness (mobile/tablet/desktop) and RTL correctness across all pages.
7. Provide `npm run dev` (local) + `npm run build` (static) for a hostable approval build; update `MILESTONES.md`.

**Verification (Phase 1):** `cd frontend/web && npm install && npm run dev` → click through every route at
375px / 768px / 1240px widths; confirm RTL, Tajawal, accent color, and that all 8 design pages plus the new
routes render with mock data and working navigation. `npm run build` produces a deployable static bundle for the client.
