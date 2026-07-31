# Admin Routing and VdoCipher Video Library Design

Date: 2026-07-31
Status: Approved design, pending implementation plan

## Context

The Admin portal currently renders every sidebar section from a `page` React state value in `Shell.jsx`. The browser URL remains `/admin/`, so refreshing, opening a bookmark, or using browser Back/Forward loses the current section and returns to Dashboard.

The Videos section currently mixes local Baytara lesson rows with separate VdoCipher import and upload dialogs. It does not behave like a complete video library: it has no folder tree, thumbnail-first browsing, persistent view selection, dedicated video URL, secure preview, metadata editor, or bulk organization tools.

## Goals

1. Give every Admin section a stable URL that survives refresh and supports direct links and browser history.
2. Give significant create, edit, and detail workflows dedicated URLs instead of relying only on transient modal state.
3. Replace the Videos table with a VdoCipher-backed library workspace.
4. Support grid, list, and table views using real VdoCipher poster images and metadata.
5. Support VdoCipher folders and subfolders at arbitrary depth, including create, rename, move, and delete operations.
6. Keep VdoCipher folder placement independent from Baytara Dawrah/course assignment.
7. Support upload, description editing, course assignment, and secure Admin playback from the Baytara Admin portal.
8. Keep the VdoCipher API secret on the backend only.

## Non-Goals

- Replacing VdoCipher as the video provider.
- Exposing the VdoCipher API secret or upload-management calls directly from the browser.
- Rebuilding the public student learning experience.
- Adding a second local folder system that can drift from VdoCipher.
- Supporting one video in multiple VdoCipher folders; VdoCipher assigns a video to one folder.

## Chosen Approach

### Route-first Admin shell

Use `react-router-dom` with `/admin` as the basename. The sidebar renders links, and the content area renders nested routes. This is preferred over a custom History API layer because nested editors, detail pages, query filters, redirects, and not-found handling are standard router behavior. Hash routing is rejected because the deployed Nginx SPA fallback already supports clean URLs.

### Library workspace

Use a collapsible VdoCipher folder tree beside a flexible library surface. The library provides grid, list, and table modes. Selecting a video opens its dedicated route. Short create/rename confirmations may remain dialogs, but navigation-level workflows must have URLs.

This combines the spacious library layout with an optional detail inspector on wide screens. Mobile uses one pane at a time without losing the selected folder or filters.

## Admin Route Inventory

`/admin/` redirects to `/admin/dashboard` after authentication. If login is required, the originally requested Admin URL is retained and opened after successful login.

| Route | Purpose |
| --- | --- |
| `/admin/dashboard` | Dashboard statistics |
| `/admin/payments` | Payment list |
| `/admin/payments/:paymentId` | Payment review and receipt |
| `/admin/baytarian` | Baytarian verification queue |
| `/admin/baytarian/:requestId` | Verification review |
| `/admin/courses` | Course list |
| `/admin/courses/new` | New course form |
| `/admin/courses/:courseId/edit` | Course editor |
| `/admin/courses/:courseId/content` | Course videos/content organization |
| `/admin/videos` | VdoCipher video library |
| `/admin/videos/:videoId` | Video preview and metadata editor |
| `/admin/bundles` | Bundle list |
| `/admin/bundles/new` | New bundle form |
| `/admin/bundles/:bundleId/edit` | Bundle editor |
| `/admin/hierarchy` | Hierarchy management |
| `/admin/categories` | Category management |
| `/admin/articles` | Article list |
| `/admin/articles/new` | New article editor |
| `/admin/articles/:articleId/edit` | Article editor |
| `/admin/users` | User list |
| `/admin/users/:userId` | User details and edit form |
| `/admin/messages` | Contact-message list |
| `/admin/messages/:messageId` | Message details |
| `/admin/settings` | Site and integration settings |

Unknown Admin paths render an Admin-scoped not-found view with a link to Dashboard. Logout clears the token and returns to `/admin/` without leaving a protected route visible.

## Route State

The Videos page stores navigable state in query parameters:

```text
/admin/videos?folder=<folderId>&view=grid&q=surgery&status=ready&course=12&page=2
```

- Refresh preserves folder, view, search, filters, and page.
- Back/Forward restores prior library states.
- `view` accepts `grid`, `list`, or `table`.
- Invalid query values fall back to safe defaults.
- The last valid view may also be remembered locally, but an explicit URL value wins.

## Video Library UX

### Header and toolbar

The page header contains:

- Current folder breadcrumb.
- Search by VdoCipher title or video ID.
- Status filter: all, ready, encoding, queued, failed.
- Baytara assignment filter: all, assigned, unassigned, specific course.
- Grid/list/table segmented view control.
- Manual refresh action.
- New folder action.
- Upload video action.

### Folder tree

The folder tree is the real VdoCipher folder hierarchy. It starts at VdoCipher root and loads children as nodes are expanded. It supports:

- Unlimited nested levels supported by VdoCipher.
- Folder video and child-folder counts.
- Create child folder.
- Rename folder.
- Move a folder to another folder.
- Delete folder with explicit confirmation and a warning that its videos move to the parent according to VdoCipher behavior.
- Collapse/expand on desktop and a folder drawer on mobile.

Existing Baytara-managed folders remain visible but are not locked. Automatic course folder helpers may create missing folders, while Admin users can organize additional folders freely.

### Library views

All three views use the same selection, filtering, and actions.

**Grid** shows a stable 16:9 poster, status, duration, title, folder, and course assignment. It is the default visual browsing mode.

**List** shows a compact thumbnail and metadata rows for repeated daily work.

**Table** shows the densest comparison view, including video ID, upload date, status, duration, folder, and Baytara course.

Each item supports selection. Bulk actions include moving videos to a VdoCipher folder, assigning or unassigning a Baytara course, importing into Baytara, and refreshing status. Destructive VdoCipher deletion is not included in the first implementation; local Baytara unlink/delete remains separately labeled to avoid accidental provider deletion.

### Empty, loading, and failure states

- Skeletons preserve card and row dimensions while loading.
- An empty folder shows upload and create-folder actions.
- A VdoCipher failure keeps the current folder and filters visible and offers retry.
- Missing credentials link directly to `/admin/settings`.
- Encoding videos display progress/status without pretending they are playable.
- Broken poster URLs use a branded video placeholder.

## Dedicated Video Page

`/admin/videos/:videoId` is the complete management view for one provider video.

It contains:

1. Secure VdoCipher player preview for ready videos.
2. Large poster and encoding state for videos that are not ready.
3. VdoCipher title and description editor.
4. Video ID, duration, upload time, status, and tags.
5. Current VdoCipher folder path and a move control.
6. Baytara mapping: assigned Dawrah/course, local Arabic title, English title, Arabic description, English description, duration override, and protection state.
7. Import, assign, reassign, or unlink actions with clear provider-versus-Baytara wording.
8. Link back to the library state that opened the video.

VdoCipher title and description are provider metadata. Baytara localized fields are local learning metadata. Saving provider metadata and saving Baytara mapping are separate actions so a partial provider outage does not discard local edits.

## Upload Workflow

Upload is available from the library and opens an XL workflow tied to the current folder.

Required inputs:

- Video file.
- Provider title.
- Provider description.
- Destination VdoCipher folder, defaulting to the current folder.

Optional Baytara inputs:

- Assign to a Dawrah/course now.
- Arabic and English local title/description overrides.

Flow:

1. Backend validates the selected folder and course.
2. Backend obtains temporary VdoCipher upload credentials for the selected folder.
3. Browser uploads the file directly to the signed storage endpoint and reports progress.
4. Backend updates the VdoCipher title and description.
5. If a course was selected, Baytara creates or updates the local lesson mapping.
6. The library opens the uploaded video's dedicated page and displays its encoding status.

If storage upload succeeds but metadata or Baytara import fails, the UI reports the VdoCipher video ID and provides a retry action without uploading the file again.

## Backend Integration

All VdoCipher management calls remain behind Admin-authenticated Flask endpoints.

### VdoCipher service capabilities

Extend the existing service with:

- List folders and subfolders.
- Create, rename, move, and delete folders.
- Move one or more videos.
- Fetch one video's complete metadata.
- Update provider title and description.
- Obtain an Admin preview OTP.
- Normalize poster selection from `poster`, `posters`, `posterUrl`, and `thumbUrl` response variants.

### Admin API surface

```text
GET    /api/v1/admin/vdocipher/folders/:folderId
POST   /api/v1/admin/vdocipher/folders
PATCH  /api/v1/admin/vdocipher/folders/:folderId
POST   /api/v1/admin/vdocipher/move
DELETE /api/v1/admin/vdocipher/folders/:folderId
GET    /api/v1/admin/vdocipher/videos
GET    /api/v1/admin/vdocipher/videos/:videoId
PATCH  /api/v1/admin/vdocipher/videos/:videoId
POST   /api/v1/admin/vdocipher/videos/:videoId/preview
POST   /api/v1/admin/vdocipher/upload-credentials
POST   /api/v1/admin/vdocipher/import
PATCH  /api/v1/admin/videos/:lessonId
```

The list response is normalized for the Admin UI and includes poster URL, description, status, duration, upload time, folder context, and any Baytara lesson/course mapping. Provider pagination remains server-driven with a maximum page size of 40.

### Provider load protection

VdoCipher documentation warns against bursty listing calls. The backend therefore uses a 30-second in-process cache for folder and list requests, deduplicates identical requests within that window, and invalidates relevant entries after mutations. Manual refresh bypasses the cache. No new cache infrastructure is required for the initial Admin-only workload.

## Data Model

Add localized descriptions to `lessons`:

```text
description     TEXT NULL
description_en  TEXT NULL
```

The existing `vdocipher_video_id` remains the provider link. Course assignment remains on `lessons.course_id`. Provider folders are not duplicated in the Baytara database; VdoCipher remains the folder source of truth.

A provider video may have zero or one Baytara lesson mapping in this implementation, matching the existing duplicate-video guard. Reassignment updates the existing mapping instead of creating a duplicate.

## Security

- Every management endpoint requires the `admin` role.
- The VdoCipher API secret is read only on the backend.
- Preview OTPs are short-lived and returned only to authenticated Admin users.
- Folder and video IDs are validated as bounded strings before provider requests.
- Provider error bodies and secrets are not passed through to the browser.
- Poster URLs may be displayed, but CSP remains restricted to HTTPS images and the VdoCipher player frame.
- Destructive folder operations require explicit confirmation and cannot target VdoCipher root.

## Error Handling

Provider failures are normalized into stable Admin errors such as:

- `no_api_key`
- `vdocipher_not_found`
- `vdocipher_rate_limited`
- `vdocipher_unreachable`
- `vdocipher_invalid_folder`
- `vdocipher_bad_response`

The frontend maps these to actionable Arabic and English messages. Local database transactions roll back when a provider-dependent mapping operation fails. Provider success followed by local failure returns the provider video ID and a retry-safe state.

## Responsive and Accessibility Behavior

- Desktop: persistent folder tree and library surface; optional details inspector on wide screens.
- Tablet: collapsible tree and full-width library.
- Mobile: folder drawer, one-column grid, compact list, horizontally scrollable table only when selected.
- View controls use familiar icons with tooltips and accessible labels.
- Video thumbnails have descriptive alternative text.
- Keyboard focus, selected rows, dialogs, and confirmation actions remain visible.
- Fixed thumbnail aspect ratios and stable toolbar dimensions prevent layout shift.

## Testing

### Frontend

- Every sidebar item updates the URL.
- Refresh preserves every primary Admin route.
- Back/Forward navigation restores prior pages.
- Protected deep links return to the same URL after login.
- Video query parameters restore folder, view, filters, and page.
- Grid, list, and table render normalized videos and poster fallbacks.
- Folder tree operations update the correct node.
- Upload sends the selected folder and description and handles partial failure.

### Backend

- VdoCipher client request methods, paths, and payloads are tested with a fake provider.
- Folder recursion and response normalization handle root, child, and empty folders.
- Move, rename, delete, metadata update, and preview endpoints enforce Admin role.
- Course assignment creates one mapping and reassignment does not duplicate it.
- Description fields serialize and update correctly.
- Provider errors are normalized and transactions roll back.
- Tests continue to use isolated temporary databases.

### Production verification

- Directly load and refresh every sidebar route on `https://baytara.app/admin/...`.
- Verify the Nginx SPA fallback serves Admin HTML for nested routes.
- Render Video Library in desktop and mobile browser screenshots.
- Confirm grid/list/table switching and nested folder navigation.
- Confirm provider posters load under CSP.
- Upload a small test video to a selected folder, save description, and verify its encoding state.
- Confirm secure Admin preview for a ready video.

## Acceptance Criteria

1. Refreshing any Admin route keeps the user on that route.
2. Browser Back/Forward works across Admin sections and video details.
3. Every sidebar section has a stable, bookmarkable URL.
4. Video Library supports grid, list, and table views without losing filters.
5. Admin users can browse and manage nested VdoCipher folders.
6. Videos display a real poster or a stable fallback, description, duration, and status.
7. Admin users can upload into the current folder and optionally assign the video to a course.
8. A video has a dedicated URL with secure preview and provider/local metadata controls.
9. No VdoCipher secret appears in frontend source, network responses, or browser storage.
10. Existing Admin, public site, and Instructor portal behavior remains operational.

## References

- [VdoCipher video listing and poster response](https://www.vdocipher.com/docs/server/videomanagement/listing/)
- [VdoCipher list subfolders](https://www.vdocipher.com/docs/server/videomanagement/folder-list/)
- [VdoCipher create folder](https://www.vdocipher.com/docs/server/videomanagement/folder-create/)
- [VdoCipher rename folder](https://www.vdocipher.com/docs/server/videomanagement/folder-update/)
- [VdoCipher move videos and folders](https://www.vdocipher.com/docs/server/videomanagement/folder-move/)
- [VdoCipher delete folder behavior](https://www.vdocipher.com/docs/server/videomanagement/folder-delete/)
- [VdoCipher poster metadata](https://www.vdocipher.com/docs/server/videomanagement/files/posters/)
- [VdoCipher API Swagger reference](https://www.vdocipher.com/docs/swagger/index.html)
