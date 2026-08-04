# Main Category Video Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve main-site category UX and show locked/register prompts for videos that require login before playback.

**Architecture:** Keep the change in the public React frontend. Use existing API fields to derive locked state, and keep secure playback unchanged.

**Tech Stack:** React 18, React Router, Vitest, Testing Library, Vite.

## Global Constraints

- Do not change backend video access rules.
- Do not leak VdoCipher OTP or playback info in public catalog/detail payloads.
- Keep Arabic and English UI strings in sync.
- Follow existing inline style and token patterns in the public website.

---

### Task 1: Public Category Browsing

**Files:**
- Modify: `frontend/web/src/pages/Videos.jsx`
- Modify: `frontend/web/src/pages/Home.jsx`
- Test: `frontend/web/src/pages/videos.test.jsx`

**Interfaces:**
- Consumes: `webapi.categories()`, `webapi.videos({ category, q, page, per_page })`
- Produces: `/videos?category=<slug>` initial filter support

- [ ] **Step 1: Write failing tests**

Add tests proving a home category opens `/videos?category=large-animals` and the videos request includes `category=large-animals`.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `cd frontend/web && npm test -- src/pages/videos.test.jsx`

- [ ] **Step 3: Implement category UX**

Initialize `Videos` category state from `useSearchParams`, update the URL when a category changes, and make home category cards navigate to `/videos?category=<slug>`.

- [ ] **Step 4: Run focused tests**

Run: `cd frontend/web && npm test -- src/pages/videos.test.jsx`

### Task 2: Locked/Register Video UI

**Files:**
- Modify: `frontend/web/src/components/VideoCard.jsx`
- Modify: `frontend/web/src/pages/VideoDetail.jsx`
- Modify: `frontend/web/src/lib/i18n.jsx`
- Test: `frontend/web/src/pages/videos.test.jsx`

**Interfaces:**
- Consumes: `video.can_play`, `video.requires_auth`, `video.requires_phone`, `isAuthed()`, `useAuth().user`
- Produces: visible locked/register copy and CTA routing to `/auth?next=/videos/:id` for anonymous viewers

- [ ] **Step 1: Write failing tests**

Add tests proving locked catalog cards show `Register to watch`, and video detail shows the locked playback message.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `cd frontend/web && npm test -- src/pages/videos.test.jsx`

- [ ] **Step 3: Implement locked UI**

Render lock badges/overlays in `VideoCard`, improve `VideoDetail` locked panel, and add Arabic/English strings.

- [ ] **Step 4: Run focused tests**

Run: `cd frontend/web && npm test -- src/pages/videos.test.jsx`

### Task 3: Final Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run public web tests**

Run: `cd frontend/web && npm test`

- [ ] **Step 2: Build public web**

Run: `cd frontend/web && npm run build`

- [ ] **Step 3: Review git diff**

Run: `git diff --stat && git diff -- frontend/web/src docs/superpowers`
