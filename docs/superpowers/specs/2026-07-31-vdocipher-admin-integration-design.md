# VdoCipher Admin Integration Design

Date: 2026-07-31

## Goal

Let admins manage VdoCipher from the existing Admin Portal without changing Baytara's course/video model. Baytara remains the source of truth for course assignment, ordering, access rules, and public playback. VdoCipher remains the source of truth for hosted video files, DRM, folders, and OTP playback.

## Current State

- Playback already works through `POST /api/v1/video/playback`, gated by enrollment and backed by VdoCipher OTP.
- `secret_vdocipher` is already editable in Admin Settings and used before the `VDOCIPHER_API_SECRET` env fallback.
- Admin already has a `Videos` page and course-level video management.
- Baytara videos are existing `Lesson` rows with optional `course_id`, `position`, and `vdocipher_video_id`.

## Folder Model

VdoCipher folders mirror Baytara's video management logic:

```text
Baytara
+-- Standalone
+-- Course Title - #courseId
```

- `Baytara` is the root folder for all platform-managed videos.
- `Standalone` holds videos not assigned to a course.
- Each course gets one child folder named `<course title> - #<course id>`.
- Folder lookup uses VdoCipher's exact folder search first, then creates missing folders.
- Baytara stores folder IDs in settings keyed by stable names:
  - `vdocipher_root_folder_id`
  - `vdocipher_standalone_folder_id`
  - `vdocipher_course_folder_<course_id>`

## Backend

Add a small VdoCipher management layer beside the existing playback provider using stdlib `urllib`.

Endpoints:

- `POST /api/v1/admin/vdocipher/test`
  - Validates the saved/current API secret by listing one video.
  - Returns `{ok: true}` or a clear error.
- `POST /api/v1/admin/vdocipher/sync-folders`
  - Ensures `Baytara` and `Standalone` folders exist.
  - Body may include `{all_courses: true}` to ensure folders for all current courses.
- `GET /api/v1/admin/vdocipher/videos?q=&folder_id=&page=1`
  - Proxies VdoCipher video listing for admins only.
  - Keeps this admin-only; public pages never depend on vendor listing.
- `POST /api/v1/admin/vdocipher/import`
  - Body: `{video_id, title, duration_minutes, course_id?}`.
  - If `course_id` is present, ensures that course folder setting exists.
  - Creates a Baytara video row using the existing `Lesson` model.

No new dependency is needed.

## Admin UI

Settings:

- Keep the existing `VdoCipher API Secret` field.
- After save, show a `Test VdoCipher` button.
- Add a `Sync folders` button.

Videos page:

- Add `Fetch from VdoCipher`.
- Show VdoCipher rows: title, ID, status, length, folder.
- Each row has `Import` / `Assign to course`.
- Imported rows become normal Baytara videos and can be reordered or edited in the existing UI.

Course video modal:

- Add a lightweight picker to search VdoCipher videos and fill `vdocipher_video_id`.
- Save still goes through existing `videoCreate` / `videoUpdate`.

## Error Handling

- Missing secret: `no_api_key`.
- Vendor HTTP errors: `vdocipher_http_<status>`.
- Network errors: `vdocipher_unreachable`.
- Missing course on import: `course_not_found`.
- Duplicate imported VdoCipher ID in Baytara: return `409 duplicate_video`.

## Testing

Add one backend self-check that patches the VdoCipher management client:

- saving/testing credentials accepts a fake secret
- sync creates or reuses root/standalone/course folders
- import creates a Baytara video attached to the selected course
- duplicate import returns 409

Frontend gets build verification only; the UI is thin over existing admin patterns.

## Explicitly Skipped

- Raw video upload from Admin Portal.
- Moving videos between VdoCipher folders after assignment.
- Background sync cron or cache.
- Public/user-facing VdoCipher listing.

Add those only when admins need to upload files directly or the VdoCipher library becomes large enough that live listing is slow.
