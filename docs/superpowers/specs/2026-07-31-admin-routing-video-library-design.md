# Admin Routing, Taxonomy, and Video Library Design

Date: 2026-07-31
Status: Approved design, pending written-spec review

## Context

The Admin portal currently renders sidebar sections from React component state while the browser remains at `/admin/`. Refreshing, bookmarking, or using browser Back and Forward therefore loses the selected section and returns to Dashboard.

The Videos section currently mixes local lesson rows with separate VdoCipher import and upload dialogs. A local video can belong to only one course because `lessons.course_id` owns the relationship and `lessons.position` owns the order. This conflicts with the required reusable library model, where one video may appear in several Dawarat with a different order in each.

Categories, course access tiers, and course-only packages already exist in a limited form. They must become a consistent catalog system for courses, standalone videos, and packages.

## Goals

1. Give every Admin section and significant workflow a stable URL that survives refresh.
2. Replace the Videos table with a complete VdoCipher-backed library using grid, list, and table views.
3. Manage VdoCipher upload, preview, metadata, folders, and nested folders from Baytara Admin.
4. Create one reusable Baytara video record for each imported VdoCipher video.
5. Allow one video to be assigned to multiple Dawarat with independent ordering in each.
6. Require every video and Dawara to use the approved fixed content taxonomy.
7. Apply the approved audience and payment criteria consistently to courses, standalone videos, and packages.
8. Let packages contain any mixture of Dawarat and standalone videos.
9. Keep VdoCipher credentials and management operations on the backend.
10. Keep all Admin dialogs XL while moving navigation-level editors to dedicated routes.

## Non-Goals

- Replacing VdoCipher as the video provider.
- Rebuilding the public student or instructor interfaces beyond changes needed to honor the new catalog relationships and entitlements.
- Duplicating the VdoCipher folder hierarchy in Baytara's database.
- Placing one provider video in multiple VdoCipher folders; VdoCipher folder placement remains singular and independent from Dawara assignment.
- Deleting provider videos from VdoCipher in the first release.
- Building prerequisites, examinations, or certification rules. In this design, "criteria" means audience, free or paid state, price, currency, and access duration.

## Chosen Architecture

### Route-first Admin shell

Add `react-router-dom` with `/admin` as the basename. Sidebar items become links and the content region renders nested routes. Login retains the originally requested Admin URL and opens it after authentication.

### Reusable video catalog

Keep `lessons` as the physical table for compatibility, but treat each row as a canonical Baytara video. Replace its single-course ownership with an explicit `course_videos` association. Each association stores the order of that video inside that specific course.

This avoids duplicating VdoCipher IDs and metadata. Editing a video updates one canonical record, while adding, removing, or reordering it in one Dawara does not affect other Dawarat.

### VdoCipher-backed library

Use the real VdoCipher hierarchy as the folder source of truth. The library has a collapsible folder tree and grid, list, and table views. Selecting a video opens its dedicated route. Small confirmations and folder actions may use XL dialogs; video, course, and package editors use dedicated pages.

## Fixed Taxonomy

Seed and idempotently upsert these six categories with stable slugs:

| Slug | English label | Arabic label |
| --- | --- | --- |
| `large-animals` | Large animals - Cattle & Sheep | الحيوانات الكبيرة - الأبقار والأغنام |
| `equine` | Equine | الخيول |
| `pet-animals` | Pet animals | الحيوانات الأليفة |
| `poultry` | Poultry | الدواجن والطيور |
| `fish-other-animal-sources` | Fish and other animal sources | الأسماك أو أي مصدر حيواني آخر |
| `camel` | Camel | الجمال |

Category is required for every published video and course. Draft records may be saved without a category so incomplete work is not lost, but publishing is blocked until one is selected. Stable taxonomy rows cannot be deleted from Admin; their localized display labels and ordering may be managed without changing their slugs.

## Access Criteria

Use the same four access types for courses, standalone videos, and packages:

| Key | Meaning | Price |
| --- | --- | --- |
| `free` | Free for anyone browsing | Forced to zero |
| `vet_free` | Free for verified veterinarians | Forced to zero |
| `baytarian` | Paid for verified veterinarians | Required and greater than zero |
| `general` | Paid for non-veterinarians | Required and greater than zero |

Verification uses `User.is_baytarian`. Admin users bypass audience restrictions. Instructor access to assigned teaching content remains available through the instructor authorization path and does not redefine veterinarian verification.

Every sellable entity also supports:

- Currency, defaulting to EGP.
- Access duration in days, with `NULL` meaning lifetime.
- Draft, published, and unpublished status.
- Arabic and English title and description.

The existing `general` access type changes from paid access for everyone to paid access for non-veterinarians, matching the approved requirement. Tests must cover that verified veterinarians cannot purchase this tier and that unverified users cannot purchase veterinarian-only tiers.

## Data Model

### Canonical videos

Extend `lessons` with:

```text
description       TEXT NULL
description_en    TEXT NULL
category_id       INTEGER NULL REFERENCES categories(id)
access_type       VARCHAR(20) NOT NULL DEFAULT 'general'
price             NUMERIC(10,2) NOT NULL DEFAULT 0
currency          VARCHAR(3) NOT NULL DEFAULT 'EGP'
access_days       INTEGER NULL
status            VARCHAR(20) NOT NULL DEFAULT 'draft'
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

`vdocipher_video_id` becomes unique for non-null values. VdoCipher folder placement is not persisted locally. Provider title, description, poster, duration, and status are normalized when reading from VdoCipher; localized learning metadata and commerce criteria remain local.

### Course assignments and ordering

Add a `course_videos` model:

```text
id          INTEGER PRIMARY KEY
course_id   INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE
video_id    INTEGER NOT NULL REFERENCES lessons(id) ON DELETE CASCADE
position    INTEGER NOT NULL DEFAULT 0
created_at  TIMESTAMP
UNIQUE(course_id, video_id)
```

`Course.videos` reads through this association ordered by `position, id`. The same video may have many assignments, and each course has an independent contiguous order. Reorder operations accept the full ordered video ID list for one course and update all positions transactionally.

Existing `lessons.course_id` and `lessons.position` values are migrated into `course_videos`. The legacy columns remain nullable during compatibility rollout and stop being written by new code. They may be removed in a later migration after all consumers use the association.

Legacy `module_id` remains readable for old data but is not part of new Dawara assignment workflows.

### Packages

Keep `bundle_courses` and add `bundle_videos`:

```text
bundle_id   INTEGER REFERENCES bundles(id) ON DELETE CASCADE
video_id    INTEGER REFERENCES lessons(id) ON DELETE CASCADE
PRIMARY KEY(bundle_id, video_id)
```

Add `access_type` to bundles and apply the same price, currency, access duration, status, and localization validation used by courses and videos. A package must contain at least one course or standalone video.

Admin publishing validation rejects audience-incompatible contents. For example, a package for non-veterinarians cannot contain veterinarian-only items. If a selected standalone video is already included through a selected course, the UI warns about the duplicate benefit but saves only one effective entitlement.

## Entitlements

A user may access a video through any valid path:

1. The standalone video is free and the user satisfies its audience rule.
2. The user has a current direct purchase or enrollment for the video.
3. The user has a current enrollment in any course containing the video.
4. The user has a current package entitlement containing the video directly.
5. The user has a current package entitlement containing a course that contains the video.

An entitlement is current until its configured access duration expires; lifetime access has no expiry. Admin users always have access. Assigned instructors retain preview access for their own courses.

The effective grant is additive: one valid path is enough. Removing a video from a course prevents future course-based access through that assignment but does not delete the video, its progress, direct purchases, package links, or assignments to other courses.

## Admin Routes

`/admin/` redirects to `/admin/dashboard` after authentication.

| Route | Purpose |
| --- | --- |
| `/admin/dashboard` | Dashboard statistics |
| `/admin/payments` | Payment list |
| `/admin/payments/:paymentId` | Payment review |
| `/admin/baytarian` | Veterinarian verification queue |
| `/admin/baytarian/:requestId` | Verification review |
| `/admin/courses` | Dawarat list |
| `/admin/courses/new` | New Dawara |
| `/admin/courses/:courseId/edit` | Dawara metadata and criteria |
| `/admin/courses/:courseId/content` | Assign and order reusable videos |
| `/admin/videos` | VdoCipher video library |
| `/admin/videos/new` | Upload and create video |
| `/admin/videos/:videoId` | Preview, metadata, category, criteria, and assignments |
| `/admin/bundles` | Package list |
| `/admin/bundles/new` | New package |
| `/admin/bundles/:bundleId/edit` | Package contents and criteria |
| `/admin/hierarchy` | Hierarchy management |
| `/admin/categories` | Fixed taxonomy management |
| `/admin/articles` | Article list |
| `/admin/articles/new` | New article |
| `/admin/articles/:articleId/edit` | Article editor |
| `/admin/users` | User list |
| `/admin/users/:userId` | User details |
| `/admin/messages` | Message list |
| `/admin/messages/:messageId` | Message details |
| `/admin/settings` | Site and VdoCipher settings |

Unknown Admin paths render an Admin-scoped not-found page. Browser Back and Forward, deep links, and refresh preserve the current route.

## Video Library

The browser state is represented in the URL:

```text
/admin/videos?folder=<folderId>&view=grid&q=surgery&status=ready&category=equine&access=baytarian&course=12&page=2
```

The toolbar includes search, provider status, category, access type, assignment, and course filters; grid/list/table view controls; refresh; new folder; and upload actions.

### Folder tree

The tree loads the real VdoCipher root and nested folders. It supports create child folder, rename, move, and delete with confirmation. A desktop tree is persistent; tablet and mobile use a drawer. Deleting a folder clearly explains VdoCipher's resulting video movement before confirmation.

### Library views

- Grid: 16:9 poster, status, duration, title, category, access badge, and assignment count.
- List: compact poster and metadata for repeated operations.
- Table: video ID, upload date, status, duration, folder, category, access, and Dawara assignments.

Selection persists while switching views. Bulk actions support moving videos to a VdoCipher folder, assigning them to one or more Dawarat, changing category or access criteria, importing provider videos, and refreshing status.

### Dedicated video page

`/admin/videos/:videoId` contains:

1. Secure VdoCipher preview for ready videos.
2. Poster and encoding status when playback is unavailable.
3. Provider title and description editing.
4. Local Arabic and English title and description.
5. Required category and access criteria.
6. Price, currency, access duration, and publication status.
7. Current VdoCipher folder and move control.
8. Searchable multi-select Dawara assignment with links to each course's content editor.
9. Provider metadata such as ID, duration, upload time, status, and tags.

Provider metadata and local catalog metadata save independently so a VdoCipher outage cannot discard local changes.

## Dawara Content Management

`/admin/courses/:courseId/content` is a dedicated organizer rather than a nested modal. It provides:

- Search and filters for the reusable video library.
- Add one or many existing videos without duplicating them.
- Upload a new VdoCipher video and assign it immediately.
- Drag-and-drop ordering with keyboard-accessible move controls.
- Poster, category, access badge, duration, and assignment count for every row.
- Remove-from-Dawara action that leaves the canonical video untouched.
- Links to video details and secure preview.

Saving order is transactional. A stale concurrent reorder returns a conflict and reload option instead of silently overwriting another Admin's work.

## Upload Workflow

Upload starts at `/admin/videos/new` and may preselect the current VdoCipher folder or current Dawara.

Required inputs:

- Video file.
- Provider title and description.
- Destination VdoCipher folder.
- Baytara Arabic or English title.
- Category.
- Access type.

Conditional inputs include price for paid types, currency, access duration, publication status, and one or more Dawara assignments.

Flow:

1. Backend validates folder, category, criteria, and selected courses.
2. Backend obtains temporary upload credentials scoped to the selected VdoCipher folder.
3. Browser uploads directly to signed storage with progress and cancellation state.
4. Backend updates VdoCipher title and description.
5. Backend creates the canonical Baytara video and all selected course assignments in one local transaction.
6. Admin opens the dedicated video page and sees live encoding state.

If storage succeeds but a later step fails, the UI retains the VdoCipher ID and offers metadata/import retry without uploading the file again.

## Packages

The package editor is a dedicated route with three sections:

1. Localized package metadata and publication state.
2. Audience, free or paid state, price, currency, and access duration.
3. Searchable selectors for Dawarat and standalone videos, showing category, audience, price, and duplicate coverage warnings.

Package totals show individual list-price totals and the package price. Validation requires at least one content item, a valid positive price for paid packages, and audience-compatible contents.

## Backend API

All management endpoints require the Admin role.

### VdoCipher

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
```

The service normalizes poster variants, status, duration, upload time, descriptions, and provider errors. List and folder calls use a short in-process cache invalidated after mutations; manual refresh bypasses it.

### Local video catalog

```text
GET    /api/v1/admin/videos
GET    /api/v1/admin/videos/:videoId
POST   /api/v1/admin/videos
PATCH  /api/v1/admin/videos/:videoId
DELETE /api/v1/admin/videos/:videoId
POST   /api/v1/admin/videos/:videoId/courses
DELETE /api/v1/admin/videos/:videoId/courses/:courseId
PUT    /api/v1/admin/courses/:courseId/videos/order
```

Deleting a local video is blocked while assignments, purchases, package contents, or progress depend on it. Admin must remove those relationships or archive/unpublish the video. Provider deletion remains a separate, unavailable action in the first release.

### Packages and taxonomy

Existing category and bundle endpoints are extended for fixed slugs, ordering, mixed contents, and access criteria. API validation is shared across videos, courses, and packages so the four tiers cannot drift between forms.

## Security and Failure Handling

- VdoCipher API keys never reach frontend source, browser storage, or JSON responses.
- Preview OTPs are short-lived and Admin-authenticated.
- Provider IDs and folder IDs are bounded and validated.
- Provider error bodies and secrets are never passed through.
- Local transactions roll back on assignment or reorder failure.
- Provider success followed by local failure returns a retry-safe VdoCipher ID.
- CSP permits only required VdoCipher player frames and HTTPS poster sources.
- Publish and purchase endpoints enforce audience rules server-side; hiding controls in the UI is not considered authorization.

Stable provider errors include `no_api_key`, `vdocipher_not_found`, `vdocipher_rate_limited`, `vdocipher_unreachable`, `vdocipher_invalid_folder`, and `vdocipher_bad_response` with Arabic and English Admin messages.

## Responsive, Language, and Modal Behavior

- Admin supports Arabic and English display language with persistent selection.
- Direction switches between RTL and LTR with the language.
- All dialogs use the shared XL modal size and remain bounded by the viewport.
- Desktop uses a persistent folder tree and optional inspector.
- Mobile uses a folder drawer, one-column grid, compact list, and deliberate horizontal table scrolling.
- Fixed poster ratios, toolbar dimensions, and focus states prevent layout shift.
- Icon actions include labels for assistive technology and tooltips where their meaning is not obvious.

## Migration

1. Upsert the six fixed categories without deleting existing non-test categories.
2. Add canonical video metadata and criteria columns.
3. Create `course_videos` and copy existing direct course assignments with their order.
4. Add `bundle_videos` and bundle access type.
5. Deploy compatibility reads, then switch all writes to the new associations.
6. Verify course content, learning progress, payments, public visibility, and instructor authorization before removing any legacy behavior.

The production business tables are currently empty except users and VdoCipher settings, but the migration remains data-preserving for development and future restores.

## Testing

### Backend

- Taxonomy upsert is idempotent and fixed slugs cannot be deleted.
- Publishing videos and courses requires a category.
- Four access types enforce audience, price, and duration rules.
- Verified and non-verified users receive only valid purchase and playback paths.
- One canonical video can be assigned to multiple courses.
- Reordering one course does not affect another.
- Duplicate course assignment is rejected without duplicating the video.
- Removing an assignment preserves other assignments and the video.
- Mixed packages grant direct-video and course-derived entitlements.
- Incompatible package audiences are rejected.
- VdoCipher requests, normalization, upload recovery, folders, preview, and error mapping use a fake provider.
- Admin role is required for every management endpoint.

### Frontend

- Every sidebar item changes the URL and survives refresh.
- Protected deep links resume after login.
- Back and Forward restore route and library query state.
- Grid, list, and table render posters, criteria, categories, and assignments.
- Upload requires category and valid access criteria.
- Multi-course assignment and per-course ordering remain independent.
- Package editor selects both courses and videos and displays compatibility errors.
- Arabic and English switching updates text direction and persists.
- Shared dialogs render XL on desktop and within mobile viewport bounds.

### Production verification

- Directly load and refresh every Admin route on `https://baytara.app/admin/...`.
- Confirm Nginx serves the Admin SPA for nested routes.
- Verify Admin and instructor authentication on `baytara.app`.
- Capture desktop and mobile screenshots of all library views and course ordering.
- Upload a small video, assign its category and criteria, and verify VdoCipher encoding.
- Assign that video to two courses, order it differently, and verify both orders.
- Create a mixed package and verify eligible and ineligible access.
- Confirm provider posters and secure preview work under CSP.

## Acceptance Criteria

1. Every Admin section and editor has a stable URL that survives refresh.
2. The six approved taxonomy categories exist and are required for publishing videos and Dawarat.
3. Every course, standalone video, and package supports the four approved access criteria.
4. Paid criteria enforce price and audience rules on the backend.
5. One VdoCipher video has one canonical Baytara record and may appear in multiple Dawarat.
6. Every Dawara controls its own video order independently.
7. Packages may contain any mixture of Dawarat and standalone videos.
8. Valid direct, course, and package entitlements grant playback without duplicating content.
9. Video Library supports nested VdoCipher folders and grid, list, and table views.
10. Admin can upload, preview, describe, categorize, price, publish, move, and assign VdoCipher videos.
11. All dialogs are XL and Admin works in Arabic and English.
12. VdoCipher secrets remain backend-only.
13. Public, Admin, and instructor behavior remains operational on `baytara.app`.

## References

- [VdoCipher video listing](https://www.vdocipher.com/docs/server/videomanagement/listing/)
- [VdoCipher list subfolders](https://www.vdocipher.com/docs/server/videomanagement/folder-list/)
- [VdoCipher create folder](https://www.vdocipher.com/docs/server/videomanagement/folder-create/)
- [VdoCipher rename folder](https://www.vdocipher.com/docs/server/videomanagement/folder-update/)
- [VdoCipher move videos and folders](https://www.vdocipher.com/docs/server/videomanagement/folder-move/)
- [VdoCipher delete folder](https://www.vdocipher.com/docs/server/videomanagement/folder-delete/)
- [VdoCipher poster metadata](https://www.vdocipher.com/docs/server/videomanagement/files/posters/)
- [VdoCipher API Swagger](https://www.vdocipher.com/docs/swagger/index.html)
