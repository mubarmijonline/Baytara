# Admin Catalog and Video Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a routed bilingual Admin catalog with fixed animal categories, reusable VdoCipher videos, multi-course ordering, mixed packages, and consistent audience-based access.

**Architecture:** Keep `lessons` as the canonical local video table for compatibility, add explicit association models for course ordering and package contents, and centralize catalog criteria and entitlement checks in focused backend services. Replace Admin component-state navigation with React Router and build the Video Library from normalized backend VdoCipher and local catalog responses.

**Tech Stack:** Flask, SQLAlchemy, Alembic, PostgreSQL/SQLite tests, pytest, React 18, React Router, Lucide React, Vite, Vitest, Testing Library, VdoCipher server APIs, Nginx, systemd.

## Global Constraints

- Keep `https://baytara.app` as the canonical public, Admin, and instructor domain.
- Keep all VdoCipher API secrets and management requests on the backend.
- Use the six fixed taxonomy slugs and bilingual labels from the approved design.
- Use exactly `free`, `vet_free`, `baytarian`, and `general` as access keys.
- Interpret `general` as paid access for non-veterinarians.
- Require category before publishing a course or video; allow incomplete drafts.
- One canonical video may belong to many courses with independent ordering.
- Packages may contain courses and standalone videos.
- All Admin dialogs use the shared XL modal dimensions.
- Admin language selection persists and switches Arabic RTL and English LTR.
- Preserve existing user records, instructor ownership checks, progress, payments, and current production VdoCipher settings.

---

## File Structure

### Backend

- `backend/app/models/catalog.py`: taxonomy, canonical video, course-video, and bundle-video relationships.
- `backend/app/models/learning.py`: video entitlements and association-based progress totals.
- `backend/app/models/payment.py`: standalone-video payment target.
- `backend/app/models/__init__.py`: export new models and association tables.
- `backend/app/services/catalog_access.py`: shared criteria validation, audience checks, and video entitlement resolution.
- `backend/app/services/vdocipher_admin.py`: normalized video/folder management client.
- `backend/app/api/v1/admin.py`: Admin taxonomy, catalog, assignment, package, and VdoCipher endpoints.
- `backend/app/api/v1/courses.py`: public catalog serialization and visibility.
- `backend/app/api/v1/payment.py`: video/package purchase resolution and grants.
- `backend/app/api/v1/video.py`: playback through direct, course, package, or instructor access.
- `backend/app/api/v1/learning.py`: association-aware progress validation.
- `backend/app/api/v1/instructor.py`: association-aware course reads and owned-course video authorization.
- `backend/migrations/versions/e7c91b4a6f20_reusable_video_catalog.py`: additive schema, taxonomy seed, and legacy assignment migration.
- `backend/tests/test_catalog_access.py`: criteria and entitlement policy.
- `backend/tests/test_admin_video_catalog.py`: Admin CRUD, assignment, ordering, and package API.
- `backend/tests/test_vdocipher_admin.py`: provider client and endpoint coverage.
- Existing payment, learning, instructor, catalog, and playback tests: compatibility updates.

### Admin frontend

- `frontend/admin/src/i18n.jsx`: language context, translations, direction, and persistent selection.
- `frontend/admin/src/routes.jsx`: route table and protected Admin layout.
- `frontend/admin/src/Shell.jsx`: routed sidebar and language control.
- `frontend/admin/src/ui.jsx`: shared XL dialog and reusable form primitives.
- `frontend/admin/src/catalog.js`: access/category display helpers and validation.
- `frontend/admin/src/api.js`: new catalog, assignment, package, and VdoCipher requests.
- `frontend/admin/src/pages/Videos.jsx`: routed Video Library workspace.
- `frontend/admin/src/pages/VideoEditor.jsx`: upload/detail/preview/criteria editor.
- `frontend/admin/src/components/VideoFolderTree.jsx`: nested VdoCipher folder navigation.
- `frontend/admin/src/components/VideoViews.jsx`: grid/list/table renderers.
- `frontend/admin/src/pages/Courses.jsx`: routed course list and metadata editor links.
- `frontend/admin/src/pages/CourseContent.jsx`: reusable video assignment and ordering.
- `frontend/admin/src/pages/Bundles.jsx`: routed mixed-package list/editor.
- `frontend/admin/src/pages/*`: route parameter support for existing detail workflows.
- `frontend/admin/src/app.css`: routed shell, library, responsive, direction, and stable dimensions.
- `frontend/admin/tests/routing.test.jsx`: refresh/deep-link route behavior.
- `frontend/admin/tests/video-library.test.jsx`: view/query/assignment behavior.
- `frontend/admin/tests/catalog-forms.test.jsx`: criteria and package validation.

---

### Task 1: Reusable Catalog Schema and Fixed Taxonomy

**Files:**
- Create: `backend/migrations/versions/e7c91b4a6f20_reusable_video_catalog.py`
- Modify: `backend/app/models/catalog.py`
- Modify: `backend/app/models/learning.py`
- Modify: `backend/app/models/payment.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/tests/test_catalog_access.py`

**Interfaces:**
- Produces: `CourseVideo`, `VideoEntitlement`, `bundle_videos`, `FIXED_CATEGORIES`, and canonical `Lesson` commerce fields.
- Produces: `Course.ordered_videos`, `Lesson.courses`, `Bundle.videos`, and `VideoEntitlement.has_access()`.

- [ ] **Step 1: Write failing schema and taxonomy tests**

```python
def test_fixed_taxonomy_and_reusable_video_models(app):
    from app.models import Category, CourseVideo, Lesson
    assert [c.slug for c in Category.query.order_by(Category.sort_order)] == [
        "large-animals", "equine", "pet-animals", "poultry",
        "fish-other-animal-sources", "camel",
    ]
    video = Lesson(title="Equine exam", category_id=Category.query.filter_by(slug="equine").one().id)
    assert video.access_type == "general"
    assert CourseVideo.__table__.c.position is not None
```

```python
def test_one_video_can_have_independent_course_positions(session, course_factory, video_factory):
    video = video_factory()
    first, second = course_factory(), course_factory()
    session.add_all([
        CourseVideo(course_id=first.id, video_id=video.id, position=3),
        CourseVideo(course_id=second.id, video_id=video.id, position=1),
    ])
    session.commit()
    assert [(a.course_id, a.position) for a in video.course_assignments] == [(first.id, 3), (second.id, 1)]
```

- [ ] **Step 2: Run tests and verify schema failures**

Run: `cd backend && pytest tests/test_catalog_access.py -q`

Expected: imports or column assertions fail because the new schema does not exist.

- [ ] **Step 3: Add models and additive migration**

Add these model contracts:

```python
FIXED_CATEGORIES = (
    ("large-animals", "الحيوانات الكبيرة - الأبقار والأغنام", "Large animals - Cattle & Sheep"),
    ("equine", "الخيول", "Equine"),
    ("pet-animals", "الحيوانات الأليفة", "Pet animals"),
    ("poultry", "الدواجن والطيور", "Poultry"),
    ("fish-other-animal-sources", "الأسماك أو أي مصدر حيواني آخر", "Fish and other animal sources"),
    ("camel", "الجمال", "Camel"),
)

class CourseVideo(db.Model):
    __tablename__ = "course_videos"
    __table_args__ = (db.UniqueConstraint("course_id", "video_id", name="uq_course_video"),)
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    video_id = db.Column(db.Integer, db.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True)
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
```

Add `Category.sort_order` and `Category.is_fixed`; canonical video description, category, criteria, price, currency, access duration, status, and timestamps; unique non-null VdoCipher ID; `Bundle.access_type`; `bundle_videos`; `Payment.video_id`; and `VideoEntitlement(user_id, video_id, source, status, expires_at)` with a unique user/video constraint.

The Alembic upgrade must:

1. Add columns and tables.
2. Upsert six categories by slug.
3. Insert one `course_videos` row for each non-null legacy `lessons.course_id`, preserving `lessons.position`.
4. Leave legacy course/module columns readable.

- [ ] **Step 4: Upgrade a fresh and an existing test database**

Run: `cd backend && flask db upgrade && flask db current`

Expected: migration reaches the new head, taxonomy rows exist, and no existing row is deleted.

- [ ] **Step 5: Run schema tests**

Run: `cd backend && pytest tests/test_catalog_access.py -q`

Expected: PASS.

- [ ] **Step 6: Commit schema slice**

```bash
git add backend/app/models backend/migrations/versions backend/tests/test_catalog_access.py
git commit -m "Add reusable video catalog schema"
```

### Task 2: Shared Criteria and Entitlement Policy

**Files:**
- Create: `backend/app/services/catalog_access.py`
- Modify: `backend/app/models/catalog.py`
- Modify: `backend/app/models/learning.py`
- Modify: `backend/app/api/v1/courses.py`
- Test: `backend/tests/test_catalog_access.py`
- Test: `backend/tests/test_access_baytarian.py`

**Interfaces:**
- Produces: `validate_catalog_item(data, current=None) -> dict[str, object]`.
- Produces: `audience_error(user, access_type) -> str | None`.
- Produces: `video_access(user, video) -> tuple[bool, str | None]`.
- Consumes: `CourseVideo`, `VideoEntitlement`, `Enrollment`, and bundle relationships from Task 1.

- [ ] **Step 1: Add failing policy tests**

```python
@pytest.mark.parametrize("access_type,is_vet,expected", [
    ("free", False, None),
    ("vet_free", False, "needs_baytarian"),
    ("vet_free", True, None),
    ("baytarian", False, "needs_baytarian"),
    ("general", False, None),
    ("general", True, "non_veterinarians_only"),
])
def test_audience_error(user_factory, access_type, is_vet, expected):
    assert audience_error(user_factory(is_baytarian=is_vet), access_type) == expected
```

```python
def test_published_item_requires_category_and_paid_price():
    with pytest.raises(CatalogValidationError) as exc:
        validate_catalog_item({"status": "published", "access_type": "baytarian", "price": 0})
    assert set(exc.value.errors) == {"category_required", "positive_price_required"}
```

- [ ] **Step 2: Verify policy tests fail**

Run: `cd backend && pytest tests/test_catalog_access.py tests/test_access_baytarian.py -q`

- [ ] **Step 3: Implement shared policy**

```python
FREE_ACCESS = {"free", "vet_free"}
PAID_ACCESS = {"baytarian", "general"}

def audience_error(user, access_type):
    if getattr(user, "role", None) == "admin":
        return None
    is_vet = bool(getattr(user, "is_baytarian", False))
    if access_type in {"vet_free", "baytarian"} and not is_vet:
        return "needs_baytarian"
    if access_type == "general" and is_vet:
        return "non_veterinarians_only"
    return None
```

`validate_catalog_item` normalizes free prices to zero, validates access keys and currency, requires positive prices for paid items, validates positive access days or `None`, and requires category for publishing courses/videos.

`video_access` grants Admin, assigned instructor, direct free access, active `VideoEntitlement`, or an active enrollment for any associated course. It returns a stable denial reason without leaking provider credentials.

- [ ] **Step 4: Update serializers and public visibility**

Make `Course.lock_reason`, `Course.visible_to`, `Lesson.to_dict`, and `Bundle.to_dict` call shared policy and expose localized category, criteria, price, duration, status, and assignment count.

- [ ] **Step 5: Run policy and public catalog tests**

Run: `cd backend && pytest tests/test_catalog_access.py tests/test_access_baytarian.py tests/test_catalog.py -q`

Expected: PASS.

- [ ] **Step 6: Commit policy slice**

```bash
git add backend/app/services/catalog_access.py backend/app/models backend/app/api/v1/courses.py backend/tests
git commit -m "Enforce catalog audience and pricing criteria"
```

### Task 3: Admin Video Catalog, Multi-Course Assignment, and Ordering API

**Files:**
- Modify: `backend/app/api/v1/admin.py`
- Modify: `backend/app/models/catalog.py`
- Create: `backend/tests/test_admin_video_catalog.py`
- Modify: `backend/tests/test_admin.py`

**Interfaces:**
- Produces: paginated `GET /api/v1/admin/videos` with `items`, `total`, `page`, and filters.
- Produces: `GET/PATCH/DELETE /api/v1/admin/videos/:videoId`.
- Produces: `POST /api/v1/admin/videos/:videoId/courses` with `{course_ids: number[]}`.
- Produces: `DELETE /api/v1/admin/videos/:videoId/courses/:courseId`.
- Produces: `PUT /api/v1/admin/courses/:courseId/videos/order` with `{video_ids: number[]}`.

- [ ] **Step 1: Write failing API tests**

```python
def test_assign_same_video_to_two_courses_and_reorder(admin_client, video, courses):
    assert admin_client.post(f"/api/v1/admin/videos/{video.id}/courses",
                             json={"course_ids": [courses[0].id, courses[1].id]}).status_code == 200
    assert admin_client.put(f"/api/v1/admin/courses/{courses[0].id}/videos/order",
                            json={"video_ids": [video.id]}).status_code == 200
    payload = admin_client.get(f"/api/v1/admin/videos/{video.id}").get_json()["video"]
    assert {c["id"] for c in payload["courses"]} == {courses[0].id, courses[1].id}
```

Add tests for duplicate VdoCipher ID, invalid category, publish validation, assignment removal, reorder membership mismatch, filters, and delete conflict when dependencies exist.

- [ ] **Step 2: Verify API tests fail**

Run: `cd backend && pytest tests/test_admin_video_catalog.py -q`

- [ ] **Step 3: Replace single-course writes with association operations**

Implement transaction helpers:

```python
def set_video_courses(video, course_ids):
    wanted = set(course_ids or [])
    existing = {row.course_id: row for row in video.course_assignments}
    # remove stale rows, preserve existing positions, append new rows at max+1 per course

def reorder_course_videos(course, video_ids):
    rows = {row.video_id: row for row in course.video_assignments}
    if set(rows) != set(video_ids):
        raise CatalogValidationError(["video_order_membership_mismatch"])
    for position, video_id in enumerate(video_ids):
        rows[video_id].position = position
```

Use `validate_catalog_item` for create/update. Keep old `/videos/reorder` as a temporary alias to the new function for deployed clients.

- [ ] **Step 4: Add category protection**

Prevent deleting fixed categories and prevent deleting any category with course or video references. Return `fixed_category` or `category_in_use` with HTTP 409.

- [ ] **Step 5: Run Admin catalog tests**

Run: `cd backend && pytest tests/test_admin_video_catalog.py tests/test_admin.py -q`

Expected: PASS.

- [ ] **Step 6: Commit Admin catalog API**

```bash
git add backend/app/api/v1/admin.py backend/app/models/catalog.py backend/tests
git commit -m "Add reusable Admin video catalog API"
```

### Task 4: Mixed Packages, Payments, Playback, Progress, and Instructor Compatibility

**Files:**
- Modify: `backend/app/api/v1/admin.py`
- Modify: `backend/app/api/v1/payment.py`
- Modify: `backend/app/api/v1/video.py`
- Modify: `backend/app/api/v1/learning.py`
- Modify: `backend/app/api/v1/instructor.py`
- Modify: `backend/app/models/learning.py`
- Modify: `backend/tests/test_contract_gaps.py`
- Modify: `backend/tests/test_fawaterk.py`
- Modify: `backend/tests/test_learning.py`
- Modify: `backend/tests/test_video.py`
- Modify: `backend/tests/test_instructor.py`

**Interfaces:**
- Produces: bundle `course_ids`, `video_ids`, and criteria validation.
- Produces: payment kind `video` and `Payment.video_id`.
- Consumes: `video_access()` from Task 2.

- [ ] **Step 1: Write failing integration tests**

```python
def test_bundle_purchase_grants_courses_and_direct_videos(client, paid_bundle, user_headers):
    payment = create_paid_payment(bundle=paid_bundle)
    apply_paid(payment)
    assert Enrollment.query.filter_by(user_id=payment.user_id).count() == len(paid_bundle.courses)
    assert VideoEntitlement.query.filter_by(user_id=payment.user_id).count() == len(paid_bundle.videos)
```

```python
def test_video_playback_accepts_any_active_course_assignment(client, video, enrolled_course, headers):
    assign(video, enrolled_course)
    response = client.post("/api/v1/video/playback", json={"lesson_id": video.id}, headers=headers)
    assert response.status_code == 200
```

Add tests for direct video checkout, audience mismatch, package compatibility rejection, expired direct entitlement, progress only for a course containing the video, and instructor preview of a video assigned to their course.

- [ ] **Step 2: Verify compatibility tests fail**

Run: `cd backend && pytest tests/test_contract_gaps.py tests/test_fawaterk.py tests/test_learning.py tests/test_video.py tests/test_instructor.py -q`

- [ ] **Step 3: Extend package and payment grants**

Add `video` to payment kinds. `_resolve_target(kind, course_id, bundle_id, video_id, uid)` validates published standalone videos and audience. `_apply_paid` upserts direct `VideoEntitlement` for video purchases and every `bundle.videos`; existing course enrollment grants remain unchanged.

Package Admin create/update accepts `course_ids`, `video_ids`, and `access_type`. Reject audience-incompatible content before commit.

- [ ] **Step 4: Make playback and progress association-aware**

Replace `Lesson.resolve_course_id()` authorization with `video_access(user, lesson)`. For progress requests, verify that the supplied enrollment's course has a `CourseVideo` row for the lesson. Calculate completion from `course_videos`, not legacy `lessons.course_id`.

- [ ] **Step 5: Update instructor reads without broadening writes**

Course serialization uses ordered association rows. Instructor video edits remain permission-gated and require that the video is assigned to an owned course. Instructor create operations may create and assign a canonical video only when `can_add_video` is true.

- [ ] **Step 6: Run backend suite**

Run: `cd backend && pytest -q`

Expected: all backend tests pass.

- [ ] **Step 7: Commit entitlement compatibility**

```bash
git add backend/app backend/tests
git commit -m "Support mixed packages and reusable video access"
```

### Task 5: Complete VdoCipher Management Service

**Files:**
- Modify: `backend/app/services/vdocipher_admin.py`
- Modify: `backend/app/api/v1/admin.py`
- Modify: `backend/tests/test_vdocipher_admin.py`

**Interfaces:**
- Produces: `list_folder(folder_id)`, `create_folder(name, parent_id)`, `rename_folder(folder_id, name)`, `move_items(folder_id, video_ids, folder_ids)`, `delete_folder(folder_id)`, `get_video(video_id)`, `update_video(video_id, title, description)`, and `preview(video_id)`.
- Produces normalized provider errors and video dictionaries with `id`, `title`, `description`, `poster`, `duration_seconds`, `status`, and `uploaded_at`.

- [ ] **Step 1: Add failing fake-provider tests**

```python
def test_normalize_video_prefers_poster_and_keeps_description():
    raw = {"id": "v1", "title": "Exam", "description": "Details", "poster": "https://img/p.jpg", "length": 90}
    assert normalize_video(raw) == {
        "id": "v1", "title": "Exam", "description": "Details",
        "poster": "https://img/p.jpg", "duration_seconds": 90,
        "status": None, "uploaded_at": None,
    }
```

Test exact request methods/paths/payloads for list/create/rename/move/delete/update/preview and every stable error code.

- [ ] **Step 2: Verify provider tests fail**

Run: `cd backend && pytest tests/test_vdocipher_admin.py -q`

- [ ] **Step 3: Implement client methods and endpoints**

Use the existing `_request` boundary, validate IDs before interpolation, and expose the endpoints listed in the design. Add a 30-second keyed in-process cache for list/folder GETs, bypassed by `refresh=1` and invalidated after mutations.

- [ ] **Step 4: Make import idempotent and upload retry-safe**

`POST /vdocipher/import` returns the existing canonical video for a known VdoCipher ID and optionally adds requested course assignments. Upload credentials accept `folder_id`; local create accepts returned `video_id` after storage success.

- [ ] **Step 5: Run provider and Admin video tests**

Run: `cd backend && pytest tests/test_vdocipher_admin.py tests/test_admin_video_catalog.py -q`

Expected: PASS.

- [ ] **Step 6: Commit provider management**

```bash
git add backend/app/services/vdocipher_admin.py backend/app/api/v1/admin.py backend/tests
git commit -m "Complete VdoCipher Admin management API"
```

### Task 6: Routed, Bilingual Admin Foundation

**Files:**
- Modify: `frontend/admin/package.json`
- Modify: `frontend/admin/package-lock.json`
- Modify: `frontend/admin/src/App.jsx`
- Modify: `frontend/admin/src/main.jsx`
- Modify: `frontend/admin/src/Shell.jsx`
- Create: `frontend/admin/src/routes.jsx`
- Create: `frontend/admin/src/i18n.jsx`
- Modify: `frontend/admin/src/ui.jsx`
- Modify: `frontend/admin/src/app.css`
- Create: `frontend/admin/tests/routing.test.jsx`

**Interfaces:**
- Produces: `useAdminLanguage()`, `t(key)`, `AdminRoutes`, and router-based sidebar navigation.
- Produces: shared `<Modal size="xl">` with viewport-safe dimensions.

- [ ] **Step 1: Install routing, icons, and test dependencies**

Run:

```bash
cd frontend/admin
npm install react-router-dom@^6 lucide-react@^0
npm install -D vitest@^2 @testing-library/react@^16 @testing-library/jest-dom@^6 jsdom@^25
```

Add `"test": "vitest run"` and retain upload helper coverage as a separate `test:upload` script.

- [ ] **Step 2: Write failing route and language tests**

```jsx
it('renders a deep-linked section and preserves it', async () => {
  renderAdmin('/admin/videos?view=grid');
  expect(await screen.findByRole('heading', { name: /videos|الفيديوهات/i })).toBeVisible();
  expect(window.location.pathname).toBe('/admin/videos');
});

it('persists English and changes direction', async () => {
  renderAdmin('/admin/dashboard');
  await userEvent.click(screen.getByRole('button', { name: /English/i }));
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
  expect(localStorage.getItem('baytara_admin_language')).toBe('en');
});
```

- [ ] **Step 3: Verify route tests fail**

Run: `cd frontend/admin && npm test -- --run tests/routing.test.jsx`

- [ ] **Step 4: Implement router and language context**

Use `BrowserRouter basename="/admin"`, `NavLink`, nested `Routes`, `Navigate`, `useParams`, and `useSearchParams`. `/` redirects to `/dashboard`; unknown routes render Admin Not Found. Authentication remains above the routed shell so a valid deep link is retained through login.

`LanguageProvider` reads `baytara_admin_language`, sets `document.documentElement.lang/dir`, and exposes Arabic and English keys for navigation, common actions, catalog criteria, errors, and new pages.

- [ ] **Step 5: Enforce shared XL dialogs and stable layout**

```css
.modal { width: min(1200px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); }
.modal-sm, .modal-md, .modal-lg { width: min(1200px, calc(100vw - 32px)); }
```

Use links for navigation, Lucide icons for familiar actions, accessible names/tooltips, and direction-safe CSS logical properties.

- [ ] **Step 6: Run route tests and build**

Run: `cd frontend/admin && npm test && npm run build`

Expected: tests pass and Vite build succeeds.

- [ ] **Step 7: Commit Admin foundation**

```bash
git add frontend/admin
git commit -m "Route and localize the Admin portal"
```

### Task 7: Video Library, Folder Tree, Upload, and Dedicated Video Pages

**Files:**
- Modify: `frontend/admin/src/api.js`
- Rewrite: `frontend/admin/src/pages/Videos.jsx`
- Create: `frontend/admin/src/pages/VideoEditor.jsx`
- Create: `frontend/admin/src/components/VideoFolderTree.jsx`
- Create: `frontend/admin/src/components/VideoViews.jsx`
- Create: `frontend/admin/src/catalog.js`
- Modify: `frontend/admin/src/app.css`
- Create: `frontend/admin/tests/video-library.test.jsx`
- Modify: `frontend/admin/tests/vdocipher-upload.mjs`

**Interfaces:**
- Consumes: Admin catalog and VdoCipher APIs from Tasks 3 and 5.
- Produces: `/videos`, `/videos/new`, and `/videos/:videoId` Admin experiences.

- [ ] **Step 1: Write failing library state tests**

```jsx
it('keeps folder, filters, and view in the URL', async () => {
  renderAdmin('/admin/videos?folder=f1&view=table&category=equine');
  expect(await screen.findByTestId('video-table')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: /grid/i }));
  expect(window.location.search).toContain('folder=f1');
  expect(window.location.search).toContain('view=grid');
});
```

Add tests for poster fallback, nested folder expansion, upload validation, encoding state, multi-course assignment, and partial upload recovery.

- [ ] **Step 2: Verify library tests fail**

Run: `cd frontend/admin && npm test -- --run tests/video-library.test.jsx`

- [ ] **Step 3: Extend API client**

Add methods for video detail, course assignment/removal, ordering, provider video detail/update/preview, folder CRUD/move, and upload credentials with `folder_id`. Keep bearer authorization in `req()` and never expose settings secrets.

- [ ] **Step 4: Build folder tree and shared views**

`VideoFolderTree` recursively loads children on expansion and emits selected folder IDs. `VideoViews` renders the same normalized items as stable 16:9 grid cards, compact list rows, or a dense table. Store navigable state in `useSearchParams`; an explicit URL view overrides the locally remembered view.

- [ ] **Step 5: Build upload and detail routes**

The upload page validates file, title, description, category, criteria, folder, and optional course IDs; performs direct signed upload with progress; then imports the canonical video and opens `/videos/:id`.

The detail page loads provider and local metadata separately, renders a secure preview for ready videos, and saves provider metadata independently from local localized metadata, criteria, and course assignments.

- [ ] **Step 6: Add loading, empty, and failure states**

Use dimension-stable skeletons, a branded fallback poster, retry actions, a direct Settings link for `no_api_key`, and the uploaded VdoCipher ID when local import fails.

- [ ] **Step 7: Run library tests and build**

Run: `cd frontend/admin && npm test && npm run build`

Expected: PASS.

- [ ] **Step 8: Commit Video Library UI**

```bash
git add frontend/admin
git commit -m "Build the VdoCipher Video Library"
```

### Task 8: Routed Course Ordering, Mixed Package Editor, and Taxonomy UI

**Files:**
- Modify: `frontend/admin/src/pages/Courses.jsx`
- Create: `frontend/admin/src/pages/CourseContent.jsx`
- Modify: `frontend/admin/src/pages/Bundles.jsx`
- Modify: `frontend/admin/src/pages/Categories.jsx`
- Modify: `frontend/admin/src/api.js`
- Modify: `frontend/admin/src/app.css`
- Create: `frontend/admin/tests/catalog-forms.test.jsx`

**Interfaces:**
- Consumes: canonical videos, categories, assignments, ordering, and mixed-package APIs.
- Produces: `/courses/new`, `/courses/:id/edit`, `/courses/:id/content`, `/bundles/new`, and `/bundles/:id/edit`.

- [ ] **Step 1: Write failing form and ordering tests**

```jsx
it('orders the same video independently in two courses', async () => {
  const first = renderCourseContent(1, [videoA, videoB]);
  await moveVideo(videoB.id, 0);
  expect(api.courseVideoOrder).toHaveBeenCalledWith(1, [videoB.id, videoA.id]);
});

it('submits a package with courses, videos, and criteria', async () => {
  renderBundleEditor();
  await selectCourse(3);
  await selectVideo(9);
  await save();
  expect(api.bundleCreate).toHaveBeenCalledWith(expect.objectContaining({
    course_ids: [3], video_ids: [9], access_type: 'baytarian',
  }));
});
```

- [ ] **Step 2: Verify catalog form tests fail**

Run: `cd frontend/admin && npm test -- --run tests/catalog-forms.test.jsx`

- [ ] **Step 3: Convert course workflows to dedicated routes**

Course list actions link to metadata and content routes. Course forms require category when publishing and share the four criteria controls. `CourseContent` supports searchable multi-select assignment, upload-and-assign, drag ordering, keyboard move buttons, and remove-from-course wording.

- [ ] **Step 4: Build mixed package editor**

Package editor has localized metadata, criteria, course selector, standalone-video selector, list-price total, package price, duplicate coverage warning, and audience compatibility errors returned by the backend.

- [ ] **Step 5: Protect and present fixed taxonomy**

Render the six fixed categories in configured order. Hide delete for fixed rows, allow bilingual label edits, and preserve stable slugs. Display API conflicts for referenced custom categories.

- [ ] **Step 6: Run Admin test suite and build**

Run: `cd frontend/admin && npm test && npm run build`

Expected: PASS.

- [ ] **Step 7: Commit catalog editors**

```bash
git add frontend/admin
git commit -m "Add course ordering and mixed package editors"
```

### Task 9: Full Regression, Deployment, and Live Verification

**Files:**
- Modify only when verification exposes a scoped defect.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: deployed, migrated application on `baytara.app` with recorded verification evidence.

- [ ] **Step 1: Run all automated verification**

Run:

```bash
cd backend && pytest -q
cd ../frontend/admin && npm test && npm run build
cd ../instructor && npm run build
cd ../web && npm run build
```

Expected: every command exits zero.

- [ ] **Step 2: Inspect migration and secrets before deployment**

Run database backup using the existing production procedure, confirm `secret_vdocipher` remains stored, run Alembic upgrade, and verify 55 user rows remain unchanged. Do not print secret values.

- [ ] **Step 3: Deploy backend and frontends**

Deploy the backend with the existing systemd service, copy Admin, instructor, and web build artifacts to their existing Nginx roots, then restart only the affected backend service and reload Nginx if configuration changed.

- [ ] **Step 4: Verify health, routing, and authentication**

Check:

```text
https://baytara.app/
https://baytara.app/admin/dashboard
https://baytara.app/admin/videos?view=grid
https://baytara.app/instructor/
https://baytara.app/api/v1/health
```

Refresh nested Admin routes directly and verify the requested page remains selected.

- [ ] **Step 5: Verify the real VdoCipher workflow**

Use Admin to test credentials, browse nested folders, upload one small non-production test video, set its bilingual description/category/criteria, observe encoding, and preview it when ready. Record its provider ID, then remove the local/provider test artifact if verification policy permits.

- [ ] **Step 6: Verify reusable assignment and package behavior**

Assign a video to two draft courses, order it differently in each, remove it from one, and confirm the other remains unchanged. Create a draft package containing one course and one standalone video and verify audience validation.

- [ ] **Step 7: Verify visual behavior with browser screenshots**

Capture desktop and mobile screenshots for grid, list, table, video detail, course content, package editor, Arabic RTL, and English LTR. Confirm no overlap, clipped controls, blank posters, or modal overflow.

- [ ] **Step 8: Commit any verification fixes and report deployment**

Run `git diff --name-only`, inspect each listed file, stage only scoped verification fixes with `git add`, then commit them with `git commit -m "Fix production catalog verification issues"`.

If no fixes are required, do not create an empty commit. Report test results, migration state, service state, and exact live URLs.

---

## Plan Self-Review

- Spec coverage: routing, language, XL dialogs, fixed taxonomy, canonical videos, multi-course assignment, per-course ordering, mixed packages, criteria, entitlement paths, VdoCipher folders/upload/preview, instructor compatibility, and production deployment each have an owning task.
- Placeholder scan: no unfinished requirements or generated-name placeholders remain.
- Type consistency: `CourseVideo.video_id` consistently references `Lesson.id`; API uses `video_ids`; `VideoEntitlement` handles direct video grants; course ordering is stored only on `CourseVideo.position`.
