# VdoCipher Upload and XL Admin Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload local video files from the Admin Videos page directly to the correct VdoCipher folder, create the Baytara video assignment after upload, and make every admin modal extra-large and responsive.

**Architecture:** Flask issues short-lived VdoCipher/S3 upload fields after validating the admin and destination. The React admin uploads directly to the returned S3 URL with `XMLHttpRequest` for progress, then uses the existing import endpoint to create the Baytara `Lesson`. Shared CSS controls every modal size.

**Tech Stack:** Flask, SQLAlchemy, stdlib `urllib`, React 18, Vite, browser `XMLHttpRequest`/`FormData`, Nginx CSP.

## Global Constraints

- Keep the VdoCipher API secret server-side.
- Preserve all existing users and do not write tests to the production database.
- Use the existing `Lesson` course/standalone assignment model and VdoCipher folder naming.
- Add no dependency.
- Upload one file at a time; no resumable or batch upload.
- Existing-video folder moves remain deferred because VdoCipher does not document that API.

---

### Task 1: Isolate Backend Self-Checks from Production

**Files:**
- Create: `backend/tests/__init__.py`

**Interfaces:**
- Consumes: Python package initialization before every `python -m tests.test_*` module.
- Produces: a unique temporary SQLite `DATABASE_URL` for each self-check process.

- [ ] **Step 1: Verify the current package does not replace a production-style URL**

Run:

```bash
cd backend
DATABASE_URL=postgresql://unsafe.example/baytara .venv/bin/python -c "import os, tests; assert os.environ['DATABASE_URL'].startswith('sqlite:///')"
```

Expected: FAIL because `tests` currently has no initializer that changes `DATABASE_URL`.

- [ ] **Step 2: Add the isolated test database initializer**

Create `backend/tests/__init__.py`:

```python
import atexit
import os
import tempfile
import uuid


_path = os.path.join(tempfile.gettempdir(), f"baytara-test-{os.getpid()}-{uuid.uuid4().hex}.sqlite")
os.environ["DATABASE_URL"] = f"sqlite:///{_path}"
atexit.register(lambda: os.path.exists(_path) and os.unlink(_path))
```

- [ ] **Step 3: Verify isolation and one existing self-check**

Run:

```bash
cd backend
DATABASE_URL=postgresql://unsafe.example/baytara .venv/bin/python -c "import os, tests; assert os.environ['DATABASE_URL'].startswith('sqlite:///')"
.venv/bin/python -m tests.test_admin
```

Expected: both commands exit 0 without connecting to PostgreSQL.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/__init__.py
git commit -m "Keep backend self-checks off production DB"
```

---

### Task 2: Add VdoCipher Upload Credentials API

**Files:**
- Modify: `backend/tests/test_vdocipher_admin.py`
- Modify: `backend/app/services/vdocipher_admin.py`
- Modify: `backend/app/api/v1/admin.py`

**Interfaces:**
- Consumes: `ensure_course_folder(course)`, `ensure_platform_folders(False)`, and the saved `secret_vdocipher` setting.
- Produces: `VdoCipherAdminClient.create_upload(title, folder_id)`, `create_upload(title, folder_id)`, and `POST /api/v1/admin/vdocipher/upload-credentials` returning `{video_id, upload_link, fields}`.

- [ ] **Step 1: Extend the fake client and add failing endpoint assertions**

Add to `FakeClient` in `backend/tests/test_vdocipher_admin.py`:

```python
def create_upload(self, title, folder_id):
    self.upload = {"title": title, "folder_id": folder_id}
    return {
        "videoId": "UPLOAD1",
        "clientPayload": {
            "uploadLink": "https://bucket.s3.amazonaws.com",
            "policy": "policy",
            "key": "key",
            "x-amz-signature": "signature",
        },
    }
```

After folder synchronization, add:

```python
upload = c.post(
    "/api/v1/admin/vdocipher/upload-credentials",
    headers=h,
    json={"title": "New upload", "course_id": course_id},
)
assert upload.status_code == 200, upload.get_json()
assert upload.get_json() == {
    "video_id": "UPLOAD1",
    "upload_link": "https://bucket.s3.amazonaws.com",
    "fields": {"policy": "policy", "key": "key", "x-amz-signature": "signature"},
}
assert va.client.upload["folder_id"] == "folder-3"
assert c.post(
    "/api/v1/admin/vdocipher/upload-credentials",
    headers=h,
    json={"title": "New upload", "course_id": 999999},
).status_code == 404
assert c.post(
    "/api/v1/admin/vdocipher/upload-credentials", headers=h, json={"title": ""}
).status_code == 422
```

- [ ] **Step 2: Run the self-check and verify failure**

Run:

```bash
cd backend
.venv/bin/python -m tests.test_vdocipher_admin
```

Expected: FAIL because `/vdocipher/upload-credentials` returns 404.

- [ ] **Step 3: Implement the client and response normalization**

Add to `VdoCipherAdminClient`:

```python
def create_upload(self, title, folder_id):
    return self._request("PUT", "/videos", params={"title": title, "folderId": folder_id})
```

Add the service function:

```python
def create_upload(title, folder_id):
    data = client.create_upload(title, folder_id)
    payload = dict(data.get("clientPayload") or {})
    upload_link = payload.pop("uploadLink", None)
    video_id = data.get("videoId")
    if not video_id or not upload_link:
        raise VdoCipherAdminError("vdocipher_bad_upload_response")
    return {"video_id": video_id, "upload_link": upload_link, "fields": payload}
```

- [ ] **Step 4: Add the admin endpoint**

Add before the import endpoint in `backend/app/api/v1/admin.py`:

```python
@bp.post("/vdocipher/upload-credentials")
@require_role("admin")
def vdocipher_upload_credentials():
    d = request.get_json() or {}
    title = (d.get("title") or "").strip()
    if not title:
        return jsonify(error="title_required"), 422
    cid = d.get("course_id")
    course = db.session.get(Course, cid) if cid else None
    if cid and not course:
        return jsonify(error="course_not_found"), 404
    try:
        if course:
            folder_id = vdocipher_admin.ensure_course_folder(course)
        else:
            folder_id = vdocipher_admin.ensure_platform_folders(False)["standalone"]
        result = vdocipher_admin.create_upload(title, folder_id)
        db.session.commit()
    except VdoCipherAdminError as e:
        db.session.rollback()
        return _vdocipher_error(e)
    return jsonify(result)
```

- [ ] **Step 5: Run the self-check and verify pass**

Run:

```bash
cd backend
.venv/bin/python -m tests.test_vdocipher_admin
```

Expected: `vdocipher admin self-check OK`.

- [ ] **Step 6: Commit**

```bash
git add backend/tests/test_vdocipher_admin.py backend/app/services/vdocipher_admin.py backend/app/api/v1/admin.py
git commit -m "Add VdoCipher upload credentials endpoint"
```

---

### Task 3: Add Tested Browser Upload Helper

**Files:**
- Create: `frontend/admin/src/vdocipher-upload.js`
- Create: `frontend/admin/tests/vdocipher-upload.mjs`
- Modify: `frontend/admin/package.json`

**Interfaces:**
- Consumes: an upload URL, a `FormData` body, an optional progress callback, and an optional XHR factory.
- Produces: `uploadForm(url, body, onProgress, createXhr)` returning a Promise.

- [ ] **Step 1: Add a failing helper self-check**

Create `frontend/admin/tests/vdocipher-upload.mjs`:

```javascript
import assert from 'node:assert/strict';
import { uploadForm } from '../src/vdocipher-upload.js';

class FakeXhr {
  constructor(status) {
    this.status = status;
    this.upload = {};
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  send(body) {
    this.body = body;
    this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 });
    this.onload();
  }
}

let progress = 0;
const ok = new FakeXhr(201);
await uploadForm('https://upload.test', { file: true }, (value) => { progress = value; }, () => ok);
assert.equal(ok.method, 'POST');
assert.equal(ok.url, 'https://upload.test');
assert.deepEqual(ok.body, { file: true });
assert.equal(progress, 50);

await assert.rejects(
  uploadForm('https://upload.test', {}, undefined, () => new FakeXhr(500)),
  /upload_failed/,
);

console.log('vdocipher browser upload self-check OK');
```

Add to `package.json`:

```json
"test": "node tests/vdocipher-upload.mjs"
```

- [ ] **Step 2: Run the self-check and verify failure**

Run:

```bash
cd frontend/admin
npm test
```

Expected: FAIL because `src/vdocipher-upload.js` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Create `frontend/admin/src/vdocipher-upload.js`:

```javascript
export function uploadForm(url, body, onProgress = () => {}, createXhr = () => new XMLHttpRequest()) {
  return new Promise((resolve, reject) => {
    const xhr = createXhr();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('upload_failed'));
    xhr.onerror = () => reject(new Error('upload_failed'));
    xhr.send(body);
  });
}
```

- [ ] **Step 4: Run test and build**

Run:

```bash
cd frontend/admin
npm test
npm run build
```

Expected: test passes and Vite build exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/admin/package.json frontend/admin/src/vdocipher-upload.js frontend/admin/tests/vdocipher-upload.mjs
git commit -m "Add browser upload progress helper"
```

---

### Task 4: Add Upload Modal and Global XL Modal Sizing

**Files:**
- Modify: `frontend/admin/src/api.js`
- Modify: `frontend/admin/src/pages/Videos.jsx`
- Modify: `frontend/admin/src/app.css`
- Modify: `frontend/admin/src/dialog.jsx`

**Interfaces:**
- Consumes: `api.vdocipherUploadCredentials(body)`, `uploadForm`, `api.vdocipherImport(body)`, and existing course loading.
- Produces: an `Upload to VdoCipher` action with progress and automatic Baytara import; all `.modal` instances use the XL shared rule.

- [ ] **Step 1: Record the currently failing static assertions**

Run:

```bash
rg -q "vdocipherUploadCredentials" frontend/admin/src/api.js
rg -q "width: min\(1200px" frontend/admin/src/app.css
! rg -q "width: 400" frontend/admin/src/dialog.jsx
```

Expected: at least the first two assertions fail and the dialog assertion fails.

- [ ] **Step 2: Add the API method**

Add beside the existing VdoCipher methods:

```javascript
vdocipherUploadCredentials: (body) => req('/admin/vdocipher/upload-credentials', {
  method: 'POST', body: JSON.stringify(body),
}),
```

- [ ] **Step 3: Add the upload modal**

In `Videos.jsx`, import `uploadForm` and add `VdoCipherUpload`. It must:

```javascript
const credentials = await api.vdocipherUploadCredentials({
  title: title.trim(),
  course_id: courseId ? Number(courseId) : null,
});
const body = new FormData();
Object.entries(credentials.fields).forEach(([key, value]) => body.append(key, value));
body.append('success_action_status', '201');
body.append('success_action_redirect', '');
body.append('file', file);
await uploadForm(credentials.upload_link, body, setProgress);
await api.vdocipherImport({
  video_id: credentials.video_id,
  title: title.trim(),
  course_id: courseId ? Number(courseId) : null,
});
```

Validate title and file before requesting credentials. Disable controls while uploading. On an import error after successful file upload, include `credentials.video_id` in the visible error. Add a toolbar button labelled `رفع إلى VdoCipher` and refresh the list after success.

- [ ] **Step 4: Apply one XL modal rule**

Change `.modal` to:

```css
.modal {
  background: var(--surface);
  border-radius: 18px;
  padding: 22px;
  width: min(1200px, calc(100vw - 40px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
}
```

Remove `style={{ width: 400 }}` from `DialogHost`'s modal element.

- [ ] **Step 5: Run static checks, helper test, and build**

Run:

```bash
rg -q "vdocipherUploadCredentials" frontend/admin/src/api.js
rg -q "width: min\(1200px" frontend/admin/src/app.css
! rg -q "width: 400" frontend/admin/src/dialog.jsx
cd frontend/admin
npm test
npm run build
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/admin/src/api.js frontend/admin/src/pages/Videos.jsx frontend/admin/src/app.css frontend/admin/src/dialog.jsx
git commit -m "Upload VdoCipher videos from admin"
```

---

### Task 5: CSP, Full Verification, and Live Deployment

**Files:**
- Modify: `deploy/nginx-security-headers.conf`
- Deploy: `/etc/nginx/snippets/baytara-security.conf`, `/var/www/baytara-admin/`, and `baytara-backend.service`

**Interfaces:**
- Consumes: Vite build output and VdoCipher's returned HTTPS Amazon S3 upload host.
- Produces: live Admin upload UI and a CSP allowing direct S3 upload connections.

- [ ] **Step 1: Verify the current CSP does not allow S3**

Run:

```bash
rg "connect-src" deploy/nginx-security-headers.conf | rg -q "amazonaws.com"
```

Expected: FAIL.

- [ ] **Step 2: Permit only HTTPS Amazon upload hosts**

Append `https://*.amazonaws.com` to `connect-src` in `deploy/nginx-security-headers.conf`. Do not relax `script-src`, `default-src`, or the other directives.

- [ ] **Step 3: Run all local verification**

Run:

```bash
cd frontend/admin
npm test
npm run build
cd ../../backend
for test_file in tests/test_*.py; do
  module=${test_file%.py}
  module=${module//\//.}
  .venv/bin/python -m "$module"
done
cd ..
git diff --check
```

Expected: every self-check and build exits 0; test package isolation prevents production writes.

- [ ] **Step 4: Install and deploy**

Run:

```bash
sudo -n install -m 644 deploy/nginx-security-headers.conf /etc/nginx/snippets/baytara-security.conf
sudo -n nginx -t
sudo -n systemctl reload nginx
sudo -n rsync -a --delete frontend/admin/dist/ /var/www/baytara-admin/
sudo -n chown -R www-data:www-data /var/www/baytara-admin
sudo -n systemctl restart baytara-backend.service
```

- [ ] **Step 5: Verify production**

Run:

```bash
curl -fsS https://baytara.mubarmijonline.com/api/v1/health
curl -fsSI https://baytara.mubarmijonline.com/admin/ | rg -i "content-security-policy:.*amazonaws.com"
docker exec baytara-pg psql -U baytara -d baytara -Atc "SELECT 'users='||count(*) FROM users UNION ALL SELECT 'non_user_rows='||sum(n_live_tup) FROM pg_stat_user_tables WHERE relname NOT IN ('users','alembic_version');"
```

Expected: health is 200, CSP includes `https://*.amazonaws.com`, users remain 55, and non-user rows remain 0 before the admin performs a real upload.

- [ ] **Step 6: Commit**

```bash
git add deploy/nginx-security-headers.conf
git commit -m "Allow VdoCipher browser uploads"
```
