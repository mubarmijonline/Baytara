# Baytara Video Security and Monitoring Design

**Date:** 2026-08-01

**Status:** Approved

**Scope:** Apply the existing learner-video security agreement to free videos and add Baytara-owned monitoring for every learner playback.

## Goals

- Keep published video metadata, categories, descriptions, and thumbnails publicly discoverable.
- Require an identified viewer before any free or paid video can play.
- Apply VdoCipher DRM, a personal moving watermark, and the two-device account limit to every learner playback.
- Record successful, denied, and failed playback activity in Baytara and report it through dedicated Admin pages.
- Measure watched and covered time using VdoCipher's supported player API rather than page-open time.

## Explicit Boundaries

- The browser never receives the VdoCipher API secret or canonical provider video ID.
- OTP and playback information are short-lived response values and are never stored in the monitoring tables.
- Browser DRM can block supported download and capture paths. No website can prevent a separate external camera; the moving personal watermark makes such a recording attributable.
- Historical sessions before this release cannot be reconstructed. Reporting starts at deployment.
- Admin provider-management previews remain role-restricted management actions. Learner analytics cover playback through the public and course learning experiences for all access types.

## Security Policy

### Public Discovery and Authenticated Playback

Anonymous visitors may list, search, filter, and open published video detail pages. The API reports that playback requires authentication instead of treating a free video as anonymously playable. Selecting **Watch** sends the visitor to `/auth?next=<video-url>` and returns them to the requested video after authentication.

Every learner playback request, including `free`, must have:

1. A valid active-user JWT.
2. A non-empty phone number on the user profile.
3. A stable Baytara device ID supplied by the public web client.
4. A token bound to the same device ID.
5. A matching active `UserDevice` record, with no more than two registered devices for the account.
6. A published video with a provider ID and a successful entitlement/audience decision.

Registration requires a phone number. Existing users without one can complete it through the profile UI before playback. The public client always sends its stable device ID during registration, login, refresh, and playback. Tokens issued to the public client contain a device claim; a removed or mismatched device is rejected at playback even if its token has not expired. Admin authentication remains compatible with its existing role-restricted portal.

### DRM and Dynamic Watermark

After Baytara completes its access and device checks, the backend requests a short-lived VdoCipher OTP. The annotation contains moving, repeated text with:

- Viewer name
- Email address
- Phone number
- Request IP address
- Short Baytara playback-session reference

The existing VdoCipher encrypted iframe remains the only learner delivery path. CSP is extended narrowly for the official VdoCipher player API script while retaining the current frame and connection restrictions.

## Monitoring Model

### Playback Session

One `VideoPlaybackSession` row represents each playback attempt. It stores:

- Public UUID/session reference
- User and video foreign keys when known
- Course context when playback originated inside a course
- Snapshot fields for video title, category, access type, viewer email, and viewer phone so reports remain useful if catalog labels later change
- Device ID, request IP, and user agent
- Status: `denied`, `provider_failed`, `issued`, `playing`, `paused`, `completed`, `error`, or `abandoned`
- Denial/failure reason without secrets
- Started, first-played, last-event, completed, and ended timestamps
- Current position, maximum position, total watched seconds, total covered seconds, duration, and completion percentage

Sessions are retained in PostgreSQL without automatic deletion.

### Event Timeline

`VideoPlaybackEvent` stores meaningful transitions: `denied`, `provider_failed`, `otp_issued`, `play`, `pause`, `resume`, `ended`, `player_error`, and `heartbeat`. Events contain server time, player position, cumulative watched/covered seconds, and a small validated metadata object where needed.

The player reports at most one heartbeat every 15 seconds while playing. Heartbeats update the aggregate session and retain a compact audit trail; raw browser `timeupdate` events are not stored individually. A client event UUID makes retries idempotent.

### Trust and Validation

The public player uses VdoCipher's official `VdoPlayer` API and reads `play`, `pause`, `timeupdate`, `ended`, `error`, `getTotalPlayed`, and `getTotalCovered` values. The backend accepts only monotonic totals, clamps values to the video duration, and caps watched-time growth against elapsed server time plus a small tolerance. Client timestamps never replace server timestamps.

An event endpoint accepts updates only from the session owner using the same device-bound token. Closed, denied, and failed sessions reject further updates. Sessions with no heartbeat for a bounded interval are reported as abandoned/inactive rather than live.

## API Design

### Learner Endpoints

- `POST /api/v1/video/playback`
  - Authentication required for every access type.
  - Accepts `lesson_id`, optional `course_id`, and the public client's device ID.
  - Creates a denied/failed/successful session as appropriate.
  - On success returns `otp`, `playbackInfo`, and `session_id`.
- `POST /api/v1/video/playback-sessions/<uuid>/events`
  - Accepts validated player transition or heartbeat data.
  - Returns the authoritative aggregate session counters.
- `PATCH /api/v1/auth/profile`
  - Lets the authenticated viewer complete or update the phone number used in watermarks.

Public video list/detail responses expose explicit `requires_auth`, `requires_phone`, and `can_play` values without exposing provider identifiers.

### Admin Endpoints

- `GET /api/v1/admin/video-reports/summary`
- `GET /api/v1/admin/video-reports/sessions`
- `GET /api/v1/admin/video-reports/sessions/<uuid>`
- `GET /api/v1/admin/video-reports/export.csv`

All endpoints require the Admin role. Filters support date range, video, category, course, access type, viewer, session status, device ID, and IP. Query limits and pagination protect the database; CSV uses the same filters and a bounded export size.

## Public Player Experience

- Anonymous viewer: sees the video and category, then **Sign in to watch**.
- Signed-in viewer without phone: sees **Add phone number to watch** and is routed to profile completion with a return URL.
- Device/security rejection: sees a localized actionable message and a link to device management where applicable.
- Successful viewer: receives the short-lived OTP, initializes the official VdoCipher player API, and reports transitions/heartbeats in the background.
- A reporting failure never exposes or replaces the DRM player token. The client retries a bounded number of idempotent events and displays an error if the security session can no longer be validated.

## Admin Experience

Add stable, refresh-safe routes and a sidebar item:

- `/admin/video-reports`
  - Summary metrics: playback attempts, successful sessions, active sessions, unique viewers, watch hours, completion rate, denied attempts, and provider/player failures.
  - Filters for all supported report dimensions.
  - Paginated session table with viewer, video, category/course, device/IP, watched time, completion, status, and latest activity.
  - CSV export using the current filters.
- `/admin/video-reports/:sessionId`
  - Session identity/security facts, aggregate playback measurements, and ordered event timeline.

Both Arabic and English Admin copy are complete. These are dedicated pages, not tab state or modal-only views.

## Error Handling and Abuse Controls

- Anonymous and malformed playback attempts remain Nginx rate-limited before reaching Gunicorn.
- Denied attempts are recorded only after input validation and under bounded request rates.
- Provider failures create a sanitized `provider_failed` session; secrets and raw provider responses are excluded.
- Event payload size, event type, numeric ranges, metadata keys, and export row count are bounded.
- Request IP is derived from the trusted Nginx proxy boundary, not an arbitrary client-supplied JSON value.
- Database writes use transactions so OTP issuance status and audit state cannot be partially committed.

## Verification and Rollout

Implementation follows test-first development and includes:

- Backend tests for mandatory authentication/phone/device checks, two-device enforcement at playback, watermark identity/IP/session content, access decisions, session creation, event idempotency, monotonic/capped counters, Admin filters/detail/CSV, and role isolation.
- Public web tests for auth/profile return flow, VdoCipher player event integration, heartbeat throttling, completion, and localized errors.
- Admin tests for routing, localization, filters, summary/table/detail states, pagination, and CSV action.
- Migration upgrade/downgrade checks, full backend and frontend suites, and all three production builds.
- Production migration and deployment after a database backup, followed by live checks that anonymous playback is denied, catalog discovery remains public, Admin report routes load, services are healthy, and no provider secret/ID is exposed.

Production acceptance must leave the existing user cleanup intact.
