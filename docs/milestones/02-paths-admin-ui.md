# 02 — Paths admin UI

**Status:** done

## Goal

Let an admin author a path without touching the API by hand.

## What landed

- Five client methods in `frontend/admin/src/api.js` (`paths`, `pathGet`, `pathCreate`,
  `pathUpdate`, `pathDelete`), next to the bundle ones.
- `frontend/admin/src/pages/Paths.jsx` — list plus editor, modelled on `Bundles.jsx`.
- Route entries (`paths`, `paths/new`, `paths/:pathId/edit`) in `frontend/admin/src/routes.jsx`
  and a `Signpost` nav item in `Shell.jsx`.
- `PATH_LEVELS` in `frontend/admin/src/catalog.js`; `nav.paths` and `paths.level.*` in
  `frontend/admin/src/i18n.jsx` (AR + EN).

## Decisions

- **Selection order is step order.** Ticking a course appends it, which is what numbers the steps.
  A second panel shows the selected steps in order with up/down buttons, because reordering by
  deselecting everything would be miserable for a five-course path.
- The editor warns that unpublished courses do not count towards the card, matching the backend.

## Acceptance check

```bash
cd /development/projects/baytara/frontend/admin && npm run build
```

Then in the admin portal: create a path, tick three courses, reorder them, publish it, and confirm
it appears in `GET /api/v1/paths` in the same order.
