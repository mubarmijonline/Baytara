# Admin Localization and Live Site Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a fully Arabic/English Admin, an editable fixed-design public website with a real live preview, and a confirmation-gated production cleanup retaining exactly the two approved accounts.

**Architecture:** Backend defaults and validation define the bilingual site-settings contract. The public API localizes that contract, the public React application fetches it once through context, and the Admin edits the raw bilingual structure while previewing the actual same-origin website through `postMessage`. A transaction-safe CLI performs the final user retention after deployment.

**Tech Stack:** Flask, Flask-SQLAlchemy, PostgreSQL, pytest, React 18, React Router, Vitest, Testing Library, Vite, Playwright, Nginx.

## Global Constraints

- Retain only active `ahmeddiab1712@gmail.com` as `admin` and active `mubarmijonline@gmail.com` as `instructor`.
- Preserve all site settings, taxonomy, and VdoCipher configuration during user cleanup.
- Arabic is the Admin default; English must render all Admin UI chrome and routed-page copy in LTR.
- User-entered Arabic data may remain visible in English mode when no English value exists.
- The public website layout remains fixed in code; Site Settings edits content, repeated records, links, and integrations.
- Public responses and preview messages must never expose keys beginning with `secret_`.
- Preview messages are accepted only in preview mode, from the same origin, with the exact namespaced message type.
- Use test-first implementation and commit each task separately.

---

### Task 1: Bilingual Site Settings Contract

**Files:**
- Create: `backend/app/site_settings.py`
- Modify: `backend/app/api/v1/content.py`
- Modify: `backend/app/api/v1/admin.py`
- Test: `backend/tests/test_site_settings.py`

**Interfaces:**
- Produces: `SITE_SETTING_DEFAULTS: dict`, `admin_settings(rows: dict) -> dict`, `public_settings(rows: dict, language: str) -> dict`, and `validate_settings_payload(payload: dict) -> tuple[dict, list[str]]`.
- Produces: `GET /api/v1/settings?lang=ar|en` localized public settings and bilingual Admin GET/PUT responses.

- [ ] **Step 1: Write failing backend tests**

```python
def test_public_settings_merge_defaults_localize_and_hide_secrets(client, app):
    with app.app_context():
        db.session.add_all([
            Setting(key="hero", value={"title": {"ar": "عنوان", "en": "Title"}}),
            Setting(key="secret_vdocipher", value="never-public"),
        ])
        db.session.commit()
    settings = client.get("/api/v1/settings?lang=en").get_json()["settings"]
    assert settings["hero"]["title"] == "Title"
    assert settings["hero"]["subtitle"]
    assert "secret_vdocipher" not in settings


def test_admin_settings_reject_malformed_localized_values(admin_client):
    response = admin_client.put("/api/v1/admin/settings", json={
        "hero": {"title": {"ar": [], "en": "Title"}},
    })
    assert response.status_code == 422
    assert "invalid_hero_title_ar" in response.get_json()["errors"]
```

- [ ] **Step 2: Run the new tests and verify contract failures**

Run: `cd backend && .venv/bin/pytest -q tests/test_site_settings.py`

Expected: FAIL because defaults, localization, and validation do not exist.

- [ ] **Step 3: Implement defaults, deep merge, localization, and validation**

```python
LOCALIZED_KEYS = frozenset(("ar", "en"))

def localize(value, language):
    if isinstance(value, dict) and set(value) == LOCALIZED_KEYS:
        return value.get(language) or value.get("ar") or value.get("en") or ""
    if isinstance(value, dict):
        return {key: localize(item, language) for key, item in value.items()}
    if isinstance(value, list):
        return [localize(item, language) for item in value]
    return value
```

Define current-design defaults for `header`, `hero`, `home`, `stats`, `testimonials`, `about`, `business`, `contact`, `socials`, and `footer`. Deep-copy defaults before merging database values. Validate supported public groups and integration scalar types. Preserve an existing secret when a password field is omitted or submitted as an empty masked value.

- [ ] **Step 4: Run backend settings and existing content tests**

Run: `cd backend && .venv/bin/pytest -q tests/test_site_settings.py tests/test_content.py tests/test_vdocipher_admin.py`

Expected: PASS.

- [ ] **Step 5: Commit the settings contract**

```bash
git add backend/app/site_settings.py backend/app/api/v1/content.py backend/app/api/v1/admin.py backend/tests/test_site_settings.py
git commit -m "Add bilingual public site settings contract"
```

### Task 2: Transaction-Safe User Retention Command

**Files:**
- Modify: `backend/app/cli.py`
- Test: `backend/tests/test_cli.py`

**Interfaces:**
- Produces: `flask retain-users --admin EMAIL --instructor EMAIL --confirm RETAIN-ONLY-NAMED-USERS`.
- Guarantees: exact case-insensitive resolution before mutation, role correction, dependent-record cleanup, atomic commit, and final counts.

- [ ] **Step 1: Write failing CLI tests**

```python
def test_retain_users_keeps_exact_accounts_and_roles(app):
    runner = app.test_cli_runner()
    result = runner.invoke(args=[
        "retain-users", "--admin", "AHMED@example.com",
        "--instructor", "trainer@example.com",
        "--confirm", "RETAIN-ONLY-NAMED-USERS",
    ])
    assert result.exit_code == 0
    with app.app_context():
        users = User.query.order_by(User.email).all()
        assert [(user.email, user.role, user.is_active) for user in users] == [
            ("ahmed@example.com", "admin", True),
            ("trainer@example.com", "instructor", True),
        ]
```

Add tests for wrong confirmation, a missing retained email, duplicate email arguments, dependent user-device rows, and preservation of settings/categories.

- [ ] **Step 2: Run the CLI tests and verify the command is missing**

Run: `cd backend && .venv/bin/pytest -q tests/test_cli.py -k retain_users`

Expected: FAIL with unknown command `retain-users`.

- [ ] **Step 3: Implement the command with one transaction**

Resolve both users before deleting anything. Delete dependent rows for removed users using model-aware SQLAlchemy deletes, set retained roles/active flags, flush, assert exactly two users, then commit. On any exception, roll back and return a nonzero exit.

- [ ] **Step 4: Run all CLI tests**

Run: `cd backend && .venv/bin/pytest -q tests/test_cli.py`

Expected: PASS.

- [ ] **Step 5: Commit the retention command**

```bash
git add backend/app/cli.py backend/tests/test_cli.py
git commit -m "Add confirmed two-account retention command"
```

### Task 3: Complete Admin English Coverage

**Files:**
- Modify: `frontend/admin/src/i18n.jsx`
- Create: `frontend/admin/src/page-copy.js`
- Modify: `frontend/admin/src/listeditor.jsx`
- Modify: `frontend/admin/src/ui.jsx`
- Modify: `frontend/admin/src/pages/Dashboard.jsx`
- Modify: `frontend/admin/src/pages/Payments.jsx`
- Modify: `frontend/admin/src/pages/Baytarian.jsx`
- Modify: `frontend/admin/src/pages/Hierarchy.jsx`
- Modify: `frontend/admin/src/pages/Articles.jsx`
- Modify: `frontend/admin/src/pages/Users.jsx`
- Modify: `frontend/admin/src/pages/Messages.jsx`
- Modify: `frontend/admin/src/pages/Settings.jsx`
- Test: `frontend/admin/tests/localization.test.jsx`

**Interfaces:**
- Produces: `pageCopy(page: string, language: "ar" | "en") -> object` for old Admin pages.
- Consumes: `useAdminLanguage()` and existing page-specific copy in Courses, CourseContent, Bundles, Categories, Videos, and VideoEditor.

- [ ] **Step 1: Write route-level English localization tests**

```jsx
it.each([
  ['/admin/dashboard', 'Dashboard'],
  ['/admin/payments', 'Payments'],
  ['/admin/baytarian', 'Veterinarian verification'],
  ['/admin/hierarchy', 'Hierarchy'],
  ['/admin/articles', 'Content and articles'],
  ['/admin/users', 'Users'],
  ['/admin/messages', 'Messages'],
  ['/admin/settings', 'Site settings'],
])('renders English UI at %s', async (route, heading) => {
  localStorage.setItem('baytara_admin_language', 'en');
  renderAdmin(route);
  expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
});
```

Mock each route's API response with empty data so Arabic business data cannot affect the assertions. Add modal/action assertions for article, user, payment, and veterinarian detail flows.

- [ ] **Step 2: Run localization tests and verify old pages fail**

Run: `cd frontend/admin && npm test -- --run tests/localization.test.jsx`

Expected: FAIL on hard-coded Arabic headings and actions.

- [ ] **Step 3: Replace hard-coded UI strings with language copy**

Each old page obtains `{ language }` from `useAdminLanguage()` and reads a complete page copy object. Translate headings, labels, statuses, buttons, dialogs, validation, loading, empty, and error states. Update `ListEditor` to accept language-aware default labels and update `apiError` callers to provide localized fallbacks.

- [ ] **Step 4: Run the full Admin suite and build**

Run: `cd frontend/admin && npm test -- --run && npm run build`

Expected: all tests and build pass.

- [ ] **Step 5: Commit complete Admin localization**

```bash
git add frontend/admin/src frontend/admin/tests/localization.test.jsx
git commit -m "Complete English localization across Admin"
```

### Task 4: Public Settings Provider and Real Preview Runtime

**Files:**
- Modify: `frontend/web/src/lib/api.js`
- Create: `frontend/web/src/lib/site-settings.jsx`
- Modify: `frontend/web/src/layouts/Layout.jsx`
- Modify: `frontend/web/src/layouts/Header.jsx`
- Modify: `frontend/web/src/layouts/Footer.jsx`
- Modify: `frontend/web/src/pages/Home.jsx`
- Modify: `frontend/web/src/pages/About.jsx`
- Modify: `frontend/web/src/pages/Business.jsx`
- Modify: `frontend/web/src/pages/Contact.jsx`
- Test: `frontend/web/src/lib/site-settings.test.jsx`
- Test: `frontend/web/src/pages/site-content.test.jsx`

**Interfaces:**
- Produces: `SiteSettingsProvider`, `useSiteSettings()`, and preview message type `baytara:site-settings-preview`.
- Consumes: localized `webapi.settings()` payload and same-origin preview payload `{ type, settings }`.

- [ ] **Step 1: Write failing provider and page tests**

```jsx
it('fetches settings once and applies a valid same-origin preview', async () => {
  render(<SiteSettingsProvider><Probe /><Probe /></SiteSettingsProvider>);
  await screen.findByText('Saved title');
  expect(fetch).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin,
    data: { type: 'baytara:site-settings-preview', settings: { hero: { title: 'Draft title' } } },
  }));
  expect(await screen.findByText('Draft title')).toBeVisible();
});
```

Add rejection tests for non-preview URLs, wrong origins, wrong types, arrays, and secret-bearing payloads. Add rendering tests proving API values appear in Header, Home, About, Business, Contact, and Footer.

- [ ] **Step 2: Run public tests and verify missing context failures**

Run: `cd frontend/web && npm test -- --run`

Expected: FAIL because the provider and preview runtime do not exist.

- [ ] **Step 3: Implement a single-fetch settings context and preview listener**

The provider fetches once, uses safe current-design fallbacks, and installs a message listener only when `preview=1`. Reject any object containing a `secret_` key recursively. Refactor public components to consume `useSiteSettings()` and replace the current hard-coded editable copy with settings values.

- [ ] **Step 4: Run public tests and production build**

Run: `cd frontend/web && npm test -- --run && npm run build`

Expected: all tests and build pass.

- [ ] **Step 5: Commit the public runtime**

```bash
git add frontend/web/src
git commit -m "Render public site from live settings context"
```

### Task 5: Site Settings Editor and Actual-Site Live Preview

**Files:**
- Create: `frontend/admin/src/site-settings-copy.js`
- Create: `frontend/admin/src/components/LocalizedField.jsx`
- Create: `frontend/admin/src/components/SitePreview.jsx`
- Modify: `frontend/admin/src/listeditor.jsx`
- Replace: `frontend/admin/src/pages/Settings.jsx`
- Modify: `frontend/admin/src/app.css`
- Test: `frontend/admin/tests/site-settings.test.jsx`

**Interfaces:**
- Consumes: bilingual Admin settings response from Task 1.
- Produces: preview posts `{ type: "baytara:site-settings-preview", settings: localizedDraft }` to the same-origin iframe after its load event and every draft change.

- [ ] **Step 1: Write failing editor and preview tests**

```jsx
it('updates the real-site preview before saving', async () => {
  renderAdmin('/admin/settings');
  const frame = await screen.findByTitle('Website live preview');
  const postMessage = vi.fn();
  Object.defineProperty(frame, 'contentWindow', { value: { postMessage } });
  await userEvent.type(screen.getByLabelText('English title'), ' Updated');
  fireEvent.load(frame);
  expect(postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
    type: 'baytara:site-settings-preview',
  }), window.location.origin);
});
```

Add tests for six tabs, Arabic/English fields, preview language/path controls, repeated-item ordering, secret exclusion from messages, draft preservation after save failure, and PUT payload shape.

- [ ] **Step 2: Run Site Settings tests and verify the old editor fails**

Run: `cd frontend/admin && npm test -- --run tests/site-settings.test.jsx`

Expected: FAIL because the fixed-design editor and live preview do not exist.

- [ ] **Step 3: Implement the editor, localized fields, and preview**

Use tabs rather than nested cards. Desktop uses `grid-template-columns: minmax(440px, .9fr) minmax(480px, 1.1fr)` with a sticky preview; under 1050px it stacks. Localize the raw bilingual draft for the selected preview language before posting it. Filter all `secret_` keys from the preview payload.

- [ ] **Step 4: Run full Admin tests and build again**

Run: `cd frontend/admin && npm test -- --run && npm run build`

Expected: all tests and build pass.

- [ ] **Step 5: Commit Site Settings**

```bash
git add frontend/admin/src frontend/admin/tests/site-settings.test.jsx
git commit -m "Add fixed-design site editor with live preview"
```

### Task 6: Deploy, Verify, and Retain Two Users

**Files:**
- No source changes expected.
- Production backup: `/var/lib/baytara/backups/baytara-<timestamp>.sql.gz`

**Interfaces:**
- Consumes all earlier tasks and the `retain-users` CLI.
- Produces deployed backend/Admin/public builds and exactly two production users.

- [ ] **Step 1: Run complete verification before deployment**

```bash
cd backend && .venv/bin/pytest -q
cd ../frontend/admin && npm test -- --run && npm run build
cd ../web && npm test -- --run && npm run build
cd ../instructor && npm run build
```

Expected: zero failures.

- [ ] **Step 2: Create and validate a fresh production backup**

```bash
sudo /development/projects/baytara/deploy/backup-db.sh
gzip -t /var/lib/baytara/backups/$(ls -1t /var/lib/baytara/backups | head -1)
```

Expected: backup path printed and `gzip -t` exits zero.

- [ ] **Step 3: Deploy backend, Admin, and public web**

Publish with `rsync -a --delete --chmod=D755,F644`, restart `baytara-backend`, and verify `/api/v1/health`, `/`, and `/admin/settings` return 200.

- [ ] **Step 4: Run authenticated Playwright acceptance checks**

Verify:

- English Dashboard, Payments, Users, Messages, and Settings contain English UI and `dir=ltr`.
- Arabic switch restores RTL.
- Unsaved Site Settings text appears inside the actual website iframe.
- Saving a temporary value updates the public website; restore the intended value immediately.
- VdoCipher `Baytara -> Standalone` folder browsing returns no request errors.

- [ ] **Step 5: Execute confirmed user retention**

```bash
cd /development/projects/baytara/backend
set -a; source .env; set +a
.venv/bin/flask retain-users \
  --admin ahmeddiab1712@gmail.com \
  --instructor mubarmijonline@gmail.com \
  --confirm RETAIN-ONLY-NAMED-USERS
```

- [ ] **Step 6: Verify exact production identities and access**

Query users and assert exactly:

```text
ahmeddiab1712@gmail.com | admin | active
mubarmijonline@gmail.com | instructor | active
```

Generate short-lived role tokens from each retained account and verify Admin and instructor protected endpoints return 200.

- [ ] **Step 7: Record deployment result**

Run `git status --short`, verify only pre-existing unrelated untracked files remain, and report the backup path, commit IDs, test totals, and live URLs.
