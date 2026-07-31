# VdoCipher Admin Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-managed VdoCipher credentials, folder sync, video listing, and import into the existing Baytara Admin Portal.

**Architecture:** Reuse the existing `Setting` table for secrets/folder IDs and existing `Lesson` rows for Baytara videos. Add one small stdlib `urllib` VdoCipher management service and admin-only endpoints; keep playback unchanged.

**Tech Stack:** Flask 3, SQLAlchemy, React 18, Vite, stdlib `urllib`; no new dependencies.

## Global Constraints

- Baytara remains the source of truth for course assignment, ordering, access rules, and public playback.
- VdoCipher remains the source of truth for hosted video files, DRM, folders, and OTP playback.
- VdoCipher folders mirror: `Baytara`, `Standalone`, and `<course title> - #<course id>`.
- No raw video upload from Admin Portal.
- Public/user-facing pages must not call VdoCipher listing APIs.
- Use TDD for backend behavior.

---

### Task 1: Backend VdoCipher Management Service and Admin API

**Files:**
- Create: `backend/app/services/vdocipher_admin.py`
- Modify: `backend/app/api/v1/admin.py`
- Test: `backend/tests/test_vdocipher_admin.py`

**Interfaces:**
- Produces: `configured() -> bool`
- Produces: `list_videos(q=None, folder_id=None, page=1, limit=20) -> dict`
- Produces: `ensure_folder(name: str, parent: str = "root") -> str`
- Produces: `ensure_platform_folders(all_courses=False) -> dict`
- Produces endpoints under `/api/v1/admin/vdocipher/*`

- [ ] **Step 1: Write failing backend self-check**

Create `backend/tests/test_vdocipher_admin.py`:

```python
"""Admin VdoCipher management self-check. Needs DATABASE_URL.

Run: python -m tests.test_vdocipher_admin
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import Category, Course, Lesson, Setting, User
from app.security import hash_password


def _admin_headers(c, app, tag):
    with app.app_context():
        db.session.add(User(name="A", email=f"vda_{tag}@t.test",
                            password_hash=hash_password("secret12"), role="admin"))
        db.session.commit()
    tok = c.post("/api/v1/auth/login", json={"email": f"vda_{tag}@t.test", "password": "secret12"}).get_json()["access_token"]
    return {"Authorization": f"Bearer {tok}"}


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]

    import app.services.vdocipher_admin as va

    folders = {}

    class FakeClient:
        def list_videos(self, **params):
            return {"count": 1, "rows": [{"id": "VIDX", "title": "عنوان من VdoCipher", "length": 180, "status": "ready"}]}

        def search_folders(self, name):
            return {"folders": [v for v in folders.values() if v["name"] == name]}

        def create_folder(self, name, parent="root"):
            fid = f"folder-{len(folders) + 1}"
            folders[fid] = {"id": fid, "name": name, "parent": parent}
            return {"id": fid, "name": name}

    va.client = FakeClient()

    with app.app_context():
        db.create_all()
        instr = User(name="I", email=f"vdi_{tag}@t.test", password_hash=hash_password("secret12"), role="instructor")
        db.session.add(instr); db.session.flush()
        cat = Category(name=f"cat {tag}", slug=f"cat-{tag}")
        db.session.add(cat); db.session.flush()
        course = Course(title=f"دورة {tag}", slug=f"course-{tag}", instructor_id=instr.id,
                        category_id=cat.id, status="published")
        db.session.add(course)
        db.session.add(Setting(key="secret_vdocipher", value="fake-secret"))
        db.session.commit()
        course_id = course.id

    c = app.test_client()
    h = _admin_headers(c, app, tag)

    assert c.post("/api/v1/admin/vdocipher/test", headers=h).status_code == 200

    sync = c.post("/api/v1/admin/vdocipher/sync-folders", headers=h, json={"all_courses": True})
    assert sync.status_code == 200, sync.get_json()
    body = sync.get_json()
    assert body["folders"]["root"] and body["folders"]["standalone"]
    assert str(course_id) in body["folders"]["courses"]

    listed = c.get("/api/v1/admin/vdocipher/videos?q=عنوان", headers=h)
    assert listed.status_code == 200
    assert listed.get_json()["videos"][0]["id"] == "VIDX"

    imported = c.post("/api/v1/admin/vdocipher/import", headers=h,
                      json={"video_id": "VIDX", "title": "عنوان من VdoCipher",
                            "duration_minutes": 3, "course_id": course_id})
    assert imported.status_code == 201, imported.get_json()
    assert imported.get_json()["video"]["course_id"] == course_id

    dup = c.post("/api/v1/admin/vdocipher/import", headers=h,
                 json={"video_id": "VIDX", "title": "again", "course_id": course_id})
    assert dup.status_code == 409

    with app.app_context():
        assert Lesson.query.filter_by(vdocipher_video_id="VIDX", course_id=course_id).count() == 1

    print("vdocipher admin self-check OK")


if __name__ == "__main__":
    demo()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/python -m tests.test_vdocipher_admin`

Expected: FAIL because `app.services.vdocipher_admin` does not exist.

- [ ] **Step 3: Implement minimal backend**

Create `backend/app/services/vdocipher_admin.py` with a small `VdoCipherAdminClient`, settings helpers, `ensure_folder`, `ensure_platform_folders`, and `list_videos`.

Add admin endpoints in `backend/app/api/v1/admin.py`:

```python
@bp.post("/vdocipher/test")
@require_role("admin")
def vdocipher_test():
    ...

@bp.post("/vdocipher/sync-folders")
@require_role("admin")
def vdocipher_sync_folders():
    ...

@bp.get("/vdocipher/videos")
@require_role("admin")
def vdocipher_videos():
    ...

@bp.post("/vdocipher/import")
@require_role("admin")
def vdocipher_import():
    ...
```

- [ ] **Step 4: Run backend self-check**

Run: `cd backend && .venv/bin/python -m tests.test_vdocipher_admin`

Expected: PASS.

### Task 2: Admin UI Controls

**Files:**
- Modify: `frontend/admin/src/api.js`
- Modify: `frontend/admin/src/pages/Settings.jsx`
- Modify: `frontend/admin/src/pages/Videos.jsx`
- Modify: `frontend/admin/src/pages/Courses.jsx`

**Interfaces:**
- Consumes: `POST /admin/vdocipher/test`
- Consumes: `POST /admin/vdocipher/sync-folders`
- Consumes: `GET /admin/vdocipher/videos`
- Consumes: `POST /admin/vdocipher/import`

- [ ] **Step 1: Add API helpers**

Add helpers:

```js
vdocipherTest: () => req('/admin/vdocipher/test', { method: 'POST' }),
vdocipherSyncFolders: (body) => req('/admin/vdocipher/sync-folders', { method: 'POST', body: JSON.stringify(body || {}) }),
vdocipherVideos: (params) => req('/admin/vdocipher/videos' + qs(params)),
vdocipherImport: (body) => req('/admin/vdocipher/import', { method: 'POST', body: JSON.stringify(body) }),
```

- [ ] **Step 2: Add Settings buttons**

In `Settings.jsx`, add `Test VdoCipher` and `Sync folders` buttons under the existing VdoCipher secret field.

- [ ] **Step 3: Add Videos import drawer/modal**

In `Videos.jsx`, add a `Fetch from VdoCipher` button, search box, results table, course selector, and import action that calls `api.vdocipherImport`.

- [ ] **Step 4: Add course video picker**

In `Courses.jsx`, add a small VdoCipher search picker inside `VideoForm`; selecting a row fills title, duration, and `vdocipher_video_id`.

- [ ] **Step 5: Build admin frontend**

Run: `cd frontend/admin && npm run build`

Expected: PASS.

### Task 3: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run targeted backend checks**

Run:

```bash
cd backend
.venv/bin/python -m tests.test_vdocipher_admin
.venv/bin/python -m tests.test_video
.venv/bin/python -m tests.test_admin
```

Expected: all PASS.

- [ ] **Step 2: Check git diff**

Run: `git status --short && git diff --stat`

Expected: only VdoCipher implementation, plan, and admin UI files changed.
