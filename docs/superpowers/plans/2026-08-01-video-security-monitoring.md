# Video Security and Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require identified, device-bound playback for every Baytara video and provide complete Baytara-owned playback security and viewing reports in Admin.

**Architecture:** PostgreSQL stores one aggregate playback session plus a compact event timeline for each attempt. The existing playback endpoint performs identity, phone, device, entitlement, and publication checks before issuing a short-lived VdoCipher OTP with a personal watermark; a separate event endpoint accepts bounded measurements from VdoCipher's official player API. A dedicated Admin API blueprint and two refresh-safe Admin pages expose summaries, filters, session detail, and CSV without adding more reporting responsibility to the existing large Admin module.

**Tech Stack:** Flask, Flask-JWT-Extended, SQLAlchemy/Alembic, PostgreSQL/SQLite tests, React 18, React Router, Vite/Vitest, VdoCipher Player V2 API, Nginx CSP/rate limiting.

## Global Constraints

- Published metadata remains public, but no free or paid learner video plays anonymously.
- Every learner playback requires an active account, phone number, token-bound registered device, entitlement/audience approval, and published provider-backed video.
- Each account remains limited to two registered devices.
- Moving watermark content is viewer name, email, phone, trusted request IP, and short Baytara session reference.
- Provider video IDs, VdoCipher API secrets, OTPs, and playback information are never persisted in monitoring records or public catalog responses.
- Player totals are monotonic, duration-clamped, and capped against elapsed server time.
- Admin reporting is bilingual and uses dedicated routes, not tab state or modal-only views.
- Monitoring begins at deployment; no historical reconstruction and no automatic record deletion.
- Existing unrelated untracked files remain untouched and the production user cleanup remains exactly two users.

---

### Task 1: Playback Monitoring Persistence

**Files:**
- Create: `backend/app/models/video_monitoring.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/migrations/versions/91c3f6a8d2e4_video_playback_monitoring.py`
- Create: `backend/tests/test_video_monitoring.py`

**Interfaces:**
- Produces: `VideoPlaybackSession`, `VideoPlaybackEvent`, `PLAYBACK_SESSION_STATUSES`, and `PLAYBACK_EVENT_TYPES`.
- Produces: `VideoPlaybackSession.to_admin_dict(lang="ar") -> dict` and `VideoPlaybackEvent.to_dict() -> dict`.
- Uses UUID strings in `public_id` and `client_event_id`; OTP/provider secrets are absent by construction.

- [ ] **Step 1: Write failing persistence and serialization tests**

Add tests that create a user, category, course, video, session, and event; assert foreign keys, snapshot fields, aggregate counters, event ordering, unique client event IDs, and the absence of `otp`, `playbackInfo`, `vdocipher_video_id`, and secret fields from serializers.

```python
session = VideoPlaybackSession(
    public_id="11111111-1111-4111-8111-111111111111",
    user_id=user.id,
    video_id=video.id,
    course_id=course.id,
    video_title="Introduction",
    category_slug="large-animals",
    access_type="free",
    viewer_email=user.email,
    viewer_phone="+201000000000",
    device_id="device-1",
    ip_address="203.0.113.4",
    user_agent="Browser Test",
    status="issued",
    duration_seconds=83,
)
event = VideoPlaybackEvent(
    session=session,
    client_event_id="22222222-2222-4222-8222-222222222222",
    event_type="otp_issued",
)
db.session.add_all([session, event])
db.session.commit()
assert session.to_admin_dict()["viewer"]["email"] == user.email
assert "otp" not in session.to_admin_dict()
assert [row.event_type for row in session.events] == ["otp_issued"]
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `cd backend && .venv/bin/pytest tests/test_video_monitoring.py -q`

Expected: collection fails because `VideoPlaybackSession` and `VideoPlaybackEvent` do not exist.

- [ ] **Step 3: Add focused models and exports**

Implement session statuses `denied`, `provider_failed`, `issued`, `playing`, `paused`, `completed`, `error`, and `abandoned`. Use indexed foreign keys, `String(36)` UUID identifiers, `String(64)` IPs, `String(80)` device IDs, `String(500)` user agents, integer second/percentage counters, timezone-aware timestamps, and an ordered cascade relationship from session to events. Store only sanitized `reason` and validated JSON metadata.

- [ ] **Step 4: Add and exercise the Alembic migration**

Set `down_revision = "6b8c21f43d7a"`. Create both tables, unique/index constraints, and reversible downgrade operations.

Run against a disposable database:

```bash
cd backend
tmp=$(mktemp -d)
DATABASE_URL="sqlite:///$tmp/monitoring.sqlite" FLASK_APP=wsgi.py .venv/bin/flask db upgrade
DATABASE_URL="sqlite:///$tmp/monitoring.sqlite" FLASK_APP=wsgi.py .venv/bin/flask db downgrade 6b8c21f43d7a
DATABASE_URL="sqlite:///$tmp/monitoring.sqlite" FLASK_APP=wsgi.py .venv/bin/flask db upgrade
rm -rf "$tmp"
```

Expected: upgrade, downgrade, and second upgrade succeed; `flask db heads` reports only `91c3f6a8d2e4`.

- [ ] **Step 5: Run the model tests and commit**

Run: `cd backend && .venv/bin/pytest tests/test_video_monitoring.py -q`

Expected: PASS.

Commit:

```bash
git add backend/app/models backend/migrations/versions/91c3f6a8d2e4_video_playback_monitoring.py backend/tests/test_video_monitoring.py
git commit -m "Add video playback monitoring records"
```

### Task 2: Phone Profiles and Device-Bound Public Tokens

**Files:**
- Modify: `backend/app/api/v1/auth.py`
- Modify: `backend/tests/test_auth.py`
- Modify: `backend/tests/test_contract_gaps.py`
- Modify registration fixtures in: `backend/tests/test_access_baytarian.py`, `backend/tests/test_admin.py`, `backend/tests/test_fawaterk.py`, `backend/tests/test_learning.py`, `backend/tests/test_notifications.py`, `backend/tests/test_video.py`
- Modify: `frontend/web/src/lib/api.js`
- Modify: `frontend/web/src/lib/auth.jsx`
- Modify: `frontend/web/src/pages/Auth.jsx`
- Modify: `frontend/web/src/pages/Dashboard.jsx`
- Modify: `frontend/web/src/lib/i18n.jsx`
- Create: `frontend/web/src/pages/auth-security.test.jsx`

**Interfaces:**
- Changes: `_tokens(user: User, device_id: str | None) -> dict` adds `device_id` to access and refresh JWT claims when supplied.
- Produces: `PATCH /api/v1/auth/profile` with `{phone}` and response `{user}`.
- Produces: `auth.profile({phone})`, `AuthProvider.updateProfile(phone)`, and device headers on authenticated public-web requests.

- [ ] **Step 1: Write failing backend auth tests**

Cover registration without phone returning `422`, trimmed phone persistence, login access/refresh tokens containing the submitted device claim, refresh preserving the device claim only while its `UserDevice` row exists, removed-device refresh returning `403 device_not_registered`, and profile phone update returning the refreshed user JSON.

```python
missing = client.post("/api/v1/auth/register", json={
    "name": "Viewer", "email": "viewer@example.test", "password": "secret12",
    "device_id": "browser-1",
})
assert missing.status_code == 422

updated = client.patch("/api/v1/auth/profile", headers=headers, json={"phone": "+201000000000"})
assert updated.get_json()["user"]["phone"] == "+201000000000"
```

- [ ] **Step 2: Verify backend RED**

Run: `cd backend && .venv/bin/pytest tests/test_auth.py tests/test_contract_gaps.py -q`

Expected: failures show optional phone, absent device JWT claim, and missing profile endpoint.

- [ ] **Step 3: Implement backend phone and token rules**

Make `RegisterSchema.phone` required and nonblank after trimming. Pass `device_id` through access and refresh token claims. In refresh, load `get_jwt()["device_id"]`, verify the matching `UserDevice`, update `last_seen`, and issue a new access token with the same claim. Add profile phone validation (nonblank, maximum 40 characters) and return `_user_json(user)`.

Update existing test registrations to include deterministic phone values; do not weaken tests by bypassing the schema.

- [ ] **Step 4: Run backend auth tests and verify GREEN**

Run: `cd backend && .venv/bin/pytest tests/test_auth.py tests/test_contract_gaps.py tests/test_access_baytarian.py tests/test_admin.py tests/test_fawaterk.py tests/test_learning.py tests/test_notifications.py tests/test_video.py -q`

Expected: PASS.

- [ ] **Step 5: Write failing public-web profile/device tests**

Test that registration marks phone required, authenticated requests include `X-Baytara-Device-ID`, profile completion calls `PATCH /auth/profile`, updates Auth context, and honors `next=/videos/2` after authentication/profile completion.

- [ ] **Step 6: Verify frontend RED, implement, and verify GREEN**

Run: `cd frontend/web && npm test -- --run src/pages/auth-security.test.jsx`

Implement localized required phone input, `next` preservation, profile form in `/dashboard/profile`, `auth.profile`, `updateProfile`, and the device header in `authFetch`.

Run the same command again. Expected: PASS.

- [ ] **Step 7: Commit device-bound authentication**

```bash
git add backend/app/api/v1/auth.py backend/tests frontend/web/src/lib frontend/web/src/pages/Auth.jsx frontend/web/src/pages/Dashboard.jsx frontend/web/src/pages/auth-security.test.jsx
git commit -m "Bind viewer sessions to registered devices"
```

### Task 3: Secure Playback Issuance and Session Audit

**Files:**
- Create: `backend/app/services/video_monitoring.py`
- Modify: `backend/app/services/video_provider.py`
- Modify: `backend/app/api/v1/video.py`
- Modify: `backend/tests/test_public_videos.py`
- Modify: `backend/tests/test_video.py`
- Modify: `backend/tests/test_contract_gaps.py`
- Modify: `backend/tests/test_video_monitoring.py`

**Interfaces:**
- Produces: `trusted_request_ip(request) -> str` using only the Nginx-overwritten forwarding boundary.
- Produces: `start_playback_attempt(user, video, course, device_id, ip_address, user_agent) -> VideoPlaybackSession`.
- Changes: `watermark_for(user, ip_address, session_ref) -> list[dict]`.
- Changes: successful playback response to `{otp, playbackInfo, session_id}`.
- Changes: public video JSON adds `requires_auth`, `requires_phone`, and correct `can_play`.

- [ ] **Step 1: Write failing secure-playback tests**

Cover anonymous free playback returning `401 authentication_required` with a denied session; missing phone; missing, mismatched, removed, and third-device states; inactive users; published/entitlement gates; provider failure; successful OTP issuance; IP/user-agent snapshots; and watermark text containing name, email, phone, IP, and the session reference.

```python
response = client.post("/api/v1/video/playback", headers={
    "Authorization": f"Bearer {token}",
    "X-Baytara-Device-ID": "browser-1",
}, json={"lesson_id": video.id})
assert response.status_code == 200
body = response.get_json()
assert body["session_id"]
session = VideoPlaybackSession.query.filter_by(public_id=body["session_id"]).one()
assert session.status == "issued"
assert session.device_id == "browser-1"
assert any(session.public_id[:8] in row["text"] for row in captured["annotate"])
```

- [ ] **Step 2: Verify playback RED**

Run: `cd backend && .venv/bin/pytest tests/test_public_videos.py tests/test_video.py tests/test_contract_gaps.py tests/test_video_monitoring.py -q`

Expected: anonymous free playback still succeeds and no monitoring records/device-bound checks exist.

- [ ] **Step 3: Implement the monitoring service and watermark contract**

Keep session creation/snapshot logic out of the route. Generate a UUID4 public ID, retain only sanitized reason codes, resolve optional course context only when the video is actually assigned to that course, and create one event per denial/provider failure/OTP issuance. Format two moving `rtext` annotation rows so the full identity remains readable.

- [ ] **Step 4: Enforce every playback gate**

Keep optional JWT parsing only so anonymous denials can be audited, then manually require identity. Validate active user, phone, token device claim, `X-Baytara-Device-ID`, matching `UserDevice`, publication, provider ID, and `video_access`. Commit denial/failure sessions before returning. After a provider success, mark the session `issued`, add `otp_issued`, and return its public ID without provider ID.

Catalog/detail serializers must use:

```python
allowed, _ = video_access(user, video)
data["requires_auth"] = user is None
data["requires_phone"] = user is not None and not bool((user.phone or "").strip())
data["can_play"] = bool(user and user.phone and allowed)
```

- [ ] **Step 5: Run focused playback tests and commit**

Run the Step 2 command. Expected: PASS.

```bash
git add backend/app/services/video_monitoring.py backend/app/services/video_provider.py backend/app/api/v1/video.py backend/tests/test_public_videos.py backend/tests/test_video.py backend/tests/test_contract_gaps.py backend/tests/test_video_monitoring.py
git commit -m "Secure and audit every video playback"
```

### Task 4: Validated Player Event Ingestion

**Files:**
- Modify: `backend/app/services/video_monitoring.py`
- Modify: `backend/app/api/v1/video.py`
- Modify: `backend/tests/test_video_monitoring.py`

**Interfaces:**
- Produces: `record_playback_event(session, user, device_id, payload, now=None) -> VideoPlaybackSession`.
- Produces: `mark_stale_sessions_abandoned(now=None, idle_seconds=60) -> int`.
- Produces: `POST /api/v1/video/playback-sessions/<uuid>/events`.
- Event body: `{event_id, type, position_seconds, watched_seconds, covered_seconds, duration_seconds}`.

- [ ] **Step 1: Write failing event-ingestion tests**

Test owner/device authorization, supported event types, UUID idempotency, monotonic totals, duration clamping, elapsed-time growth cap, first-play timestamp, play/pause/resume/ended/error transitions, completion percentage, closed-session rejection, invalid/oversized payload rejection, and no secret-bearing metadata.

```python
first = post_event("play", watched=0, covered=0, position=0)
retry = post_event("play", event_id=first_event_id, watched=999, covered=999, position=999)
assert retry.status_code == 200
assert VideoPlaybackEvent.query.filter_by(client_event_id=first_event_id).count() == 1
assert session.watched_seconds == 0
```

- [ ] **Step 2: Verify event RED**

Run: `cd backend && .venv/bin/pytest tests/test_video_monitoring.py -q`

Expected: event endpoint is `404` and service function is absent.

- [ ] **Step 3: Implement schema validation and authoritative aggregation**

Accept only `play`, `pause`, `resume`, `heartbeat`, `ended`, and `player_error`. Validate event UUID, nonnegative finite integer seconds, maximum duration `86400`, and metadata keys from a fixed allowlist. Lock the session row while updating under PostgreSQL, return the existing aggregate on duplicate event UUID, and cap watched growth to `ceil(elapsed_seconds * 2.5) + 5` while never decreasing any total.

Implement `mark_stale_sessions_abandoned` to close `issued`, `playing`, and `paused` sessions whose last event is older than the cutoff. Admin report queries call it before calculating live/abandoned status, so stale rows do not remain visibly active forever.

- [ ] **Step 4: Add the authenticated event endpoint**

Require the owning user, matching token/device header, an active registered device, and an open session. Return:

```json
{
  "session": {
    "session_id": "uuid",
    "status": "playing",
    "watched_seconds": 30,
    "covered_seconds": 28,
    "completion_percent": 34
  }
}
```

- [ ] **Step 5: Verify GREEN and commit**

Run: `cd backend && .venv/bin/pytest tests/test_video_monitoring.py tests/test_public_videos.py tests/test_video.py -q`

Expected: PASS.

```bash
git add backend/app/services/video_monitoring.py backend/app/api/v1/video.py backend/tests/test_video_monitoring.py
git commit -m "Record validated VdoCipher player events"
```

### Task 5: Shared Public VdoCipher Player and Security UX

**Files:**
- Create: `frontend/web/src/components/SecureVdoPlayer.jsx`
- Modify: `frontend/web/src/lib/api.js`
- Modify: `frontend/web/src/lib/i18n.jsx`
- Modify: `frontend/web/src/pages/VideoDetail.jsx`
- Modify: `frontend/web/src/pages/Learn.jsx`
- Modify: `frontend/web/src/pages/videos.test.jsx`
- Create: `frontend/web/src/components/SecureVdoPlayer.test.jsx`
- Modify: `deploy/nginx-security-headers.conf`
- Modify: `deploy/deploy.sh`

**Interfaces:**
- Produces: `<SecureVdoPlayer playback={...} title={...} onEnded={...} onSecurityError={...} />`.
- Produces: `auth.playback(lessonId, courseId?)` including device context.
- Produces: `auth.playbackEvent(sessionId, event)`.

- [ ] **Step 1: Write failing component tests with a fake official player API**

Provide a fake `window.VdoPlayer.getInstance()` whose `video` supports listeners and whose API resolves `getTotalPlayed`/`getTotalCovered`. Assert one `play`, `pause`, `ended`, and throttled 15-second heartbeat request; stable UUID event IDs on retry; listener/timer cleanup; and `onEnded` invocation.

- [ ] **Step 2: Verify component RED**

Run: `cd frontend/web && npm test -- --run src/components/SecureVdoPlayer.test.jsx src/pages/videos.test.jsx`

Expected: component import fails and the anonymous free-video test expects the old playback behavior.

- [ ] **Step 3: Implement the official VdoCipher event bridge**

Load `https://player.vdocipher.com/v2/api.js` once, wait for `window.onVdoPlayerV2APIReady` when needed, initialize against an iframe ref, subscribe to player events, read cumulative totals, throttle heartbeat calls, retry each event at most twice with the same `event_id`, and clean up all subscriptions/timers on unmount or playback change.

- [ ] **Step 4: Apply the shared component to both learner experiences**

In `VideoDetail`, route anonymous viewers to `/auth?next=/videos/<id>`, route missing-phone viewers to `/dashboard/profile?next=/videos/<id>`, and render localized device/security/provider errors. In `Learn`, pass `apiCourse.id` as the integer course context and replace its raw iframe with `SecureVdoPlayer`; preserve completion behavior on `ended`.

- [ ] **Step 5: Update CSP and deployment installation**

Add only `https://player.vdocipher.com` to `script-src`. Ensure `deploy/deploy.sh` installs `deploy/nginx-security-headers.conf` to `/etc/nginx/snippets/baytara-security.conf` before `nginx -t`.

- [ ] **Step 6: Run web tests/build and commit**

```bash
cd frontend/web
npm test -- --run src/components/SecureVdoPlayer.test.jsx src/pages/videos.test.jsx src/pages/auth-security.test.jsx
npm run build
```

Expected: PASS and Vite build succeeds.

```bash
git add frontend/web/src deploy/nginx-security-headers.conf deploy/deploy.sh
git commit -m "Track secure VdoCipher playback in the public site"
```

### Task 6: Admin Video Reporting API and CSV

**Files:**
- Create: `backend/app/api/v1/admin_video_reports.py`
- Modify: `backend/app/__init__.py`
- Create: `backend/tests/test_admin_video_reports.py`

**Interfaces:**
- Produces: `/api/v1/admin/video-reports/summary`, `/sessions`, `/sessions/<uuid>`, and `/export.csv`.
- Produces one shared `filtered_sessions(args)` query used by list, summary, and CSV so filter semantics cannot drift.

- [ ] **Step 1: Write failing Admin report tests**

Seed multiple categories, courses, videos, users, devices, statuses, dates, and events. Assert Admin-only access, summary calculations, active-session cutoff, every documented filter, pagination, detail timeline order, unknown session `404`, CSV header/escaping/filter parity, and a hard export cap.

```python
summary = admin.get("/api/v1/admin/video-reports/summary?category=large-animals")
assert summary.get_json() == {
    "attempts": 3,
    "successful": 2,
    "active": 1,
    "unique_viewers": 2,
    "watch_seconds": 180,
    "completion_rate": 50,
    "denied": 1,
    "failures": 0,
}
```

- [ ] **Step 2: Verify report API RED**

Run: `cd backend && .venv/bin/pytest tests/test_admin_video_reports.py -q`

Expected: report endpoints are `404`.

- [ ] **Step 3: Implement a dedicated role-protected blueprint**

Register the blueprint at `/api/v1/admin/video-reports`. Parse ISO dates, bounded page/per-page values, and exact filters for video, category, course, access type, viewer, status, device, and IP. Define active as status in `issued/playing/paused` with `last_event_at` within 60 seconds. Calculate watch hours from summed seconds and completion rate from completed successful sessions.

- [ ] **Step 4: Implement bounded CSV streaming**

Use Python's `csv` module, UTF-8 BOM for spreadsheet compatibility, RFC-compliant quoting, the same filtered query, deterministic newest-first order, and maximum 10,000 rows. Prefix cells beginning with `=`, `+`, `-`, or `@` with a single quote to prevent spreadsheet formula execution. Include session reference, viewer identity, video/category/course, access type, status/reason, device/IP/browser, timestamps, watched/covered/duration seconds, and completion percentage.

- [ ] **Step 5: Verify GREEN and commit**

Run: `cd backend && .venv/bin/pytest tests/test_admin_video_reports.py tests/test_video_monitoring.py -q`

Expected: PASS.

```bash
git add backend/app/api/v1/admin_video_reports.py backend/app/__init__.py backend/tests/test_admin_video_reports.py
git commit -m "Add Admin video security reports"
```

### Task 7: Dedicated Bilingual Admin Report Pages

**Files:**
- Create: `frontend/admin/src/pages/VideoReports.jsx`
- Modify: `frontend/admin/src/routes.jsx`
- Modify: `frontend/admin/src/Shell.jsx`
- Modify: `frontend/admin/src/api.js`
- Modify: `frontend/admin/src/i18n.jsx`
- Modify: `frontend/admin/src/page-copy.js`
- Modify: `frontend/admin/src/app.css`
- Create: `frontend/admin/tests/video-reports.test.jsx`
- Modify: `frontend/admin/tests/routing.test.jsx`
- Modify: `frontend/admin/tests/localization.test.jsx`

**Interfaces:**
- Produces stable routes `/video-reports` and `/video-reports/:sessionId` under the Admin base.
- Produces API methods `videoReportSummary(params)`, `videoReportSessions(params)`, `videoReportSession(id)`, and `downloadVideoReport(params) -> Promise<Blob>`.

- [ ] **Step 1: Write failing Admin report UI tests**

Cover sidebar navigation/deep-link refresh, Arabic/English labels, summary metrics, all filters encoded in URL search parameters, pagination, empty/error/loading states, row-to-detail navigation, identity/device/IP facts, event timeline order, Back behavior, and CSV action retaining filters.

- [ ] **Step 2: Verify Admin RED**

Run: `cd frontend/admin && npm test -- --run tests/video-reports.test.jsx tests/routing.test.jsx tests/localization.test.jsx`

Expected: report route/sidebar/API methods do not exist.

- [ ] **Step 3: Implement the report list page**

Use compact operational styling: restrained KPI strip, one filter toolbar, a dense responsive table, status badges, and pagination. Keep all filter/page state in `useSearchParams`; changing a filter resets page to 1. Use Lucide `BarChart3`, `Download`, `RefreshCw`, and `Eye` icons with localized tooltips.

- [ ] **Step 4: Implement the session detail page**

Render unframed identity/security and measurement sections followed by an ordered event table. Mask no values because the route is Admin-only, but never expect or render OTP/provider secrets. Use the existing route-parameter page pattern and a normal Back command rather than a modal.

- [ ] **Step 5: Implement authenticated CSV download**

Fetch the CSV with the Admin bearer token, create a temporary object URL, click a generated download anchor named `baytara-video-report-YYYY-MM-DD.csv`, then revoke the object URL. Do not place the JWT in a query string.

- [ ] **Step 6: Verify Admin GREEN/build and commit**

```bash
cd frontend/admin
npm test -- --run tests/video-reports.test.jsx tests/routing.test.jsx tests/localization.test.jsx
npm run build
```

Expected: PASS and Vite build succeeds.

```bash
git add frontend/admin/src frontend/admin/tests
git commit -m "Add bilingual Admin video monitoring pages"
```

### Task 8: Full Verification and Production Rollout

**Files:**
- Verify all modified files
- Update only test expectations directly affected by the approved security contract

**Interfaces:**
- Consumes every prior task and produces the deployed production release.

- [ ] **Step 1: Run migration and static checks**

```bash
cd backend
FLASK_APP=wsgi.py .venv/bin/flask db heads
cd ..
git diff --check
```

Expected: one migration head and no whitespace errors.

- [ ] **Step 2: Run full suites sequentially**

```bash
cd backend && .venv/bin/pytest -q
cd ../frontend/web && npm test -- --run
cd ../admin && npm test -- --run
```

Expected: all tests pass. Run Admin separately from other frontend suites to avoid known timing contention.

- [ ] **Step 3: Build every portal**

```bash
cd frontend/web && npm run build
cd ../admin && npm run build
cd ../instructor && npm run build
```

Expected: all builds succeed.

- [ ] **Step 4: Request final code review and resolve findings**

Review authorization boundaries, device-token lifecycle, raw IP trust, counter tampering, event idempotency, CSV injection/escaping, query bounds, CSP, secret exposure, and migration downgrade. Repeat focused and full verification after any fix.

- [ ] **Step 5: Back up and migrate production**

Create a timestamped PostgreSQL dump in `/var/lib/baytara/backups/`. Read `DATABASE_URL` from the running `baytara-backend.service` process environment without printing it, then run `FLASK_APP=wsgi.py .venv/bin/flask db upgrade` and verify the new revision is current.

- [ ] **Step 6: Install security configuration and deploy builds**

Install the updated CSP snippet and Nginx site/rate configurations, run `sudo nginx -t`, restart `baytara-backend.service`, rsync the web/Admin/instructor `dist/` directories to their existing `/var/www` roots, reload Nginx, and verify both services are active.

- [ ] **Step 7: Perform production acceptance without leaving test data**

Verify:

- `/`, `/videos`, `/videos/2`, `/admin/video-reports`, and `/instructor/` return `200`.
- Public catalog still returns Introduction under `large-animals`, but anonymous `can_play` is false and no provider ID is exposed.
- Anonymous free-video playback returns `401 authentication_required` and creates a rate-limited denied audit record.
- Admin report list/detail APIs return the denial without exposing OTP/provider secret/provider ID.
- Production contains only `ahmeddiab1712@gmail.com` Admin and `mubarmijonline@gmail.com` instructor after acceptance.
- Nginx and backend are active and deployed HTML references the newly built hashed assets.

- [ ] **Step 8: Commit final corrections and report deployment**

Stage only task-owned files. Report commit IDs, test totals, live URLs, migration revision, backup path, and the verified production security behavior.
