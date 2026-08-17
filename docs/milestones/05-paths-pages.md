# 05 — Paths pages

**Status:** done

## Goal

Somewhere for the home page's «كل المسارات ←» and the nav's «المسارات» to land.

## What landed

- `webapi.paths()` / `webapi.path(slug)` and `auth.learningSummary()` in
  `frontend/web/src/lib/api.js`, plus a `compact(n, lang)` helper (`Intl`, no lookup table) for
  the instructor cards' "84 ألف متعلّم" line.
- `frontend/web/src/components/PathCard.jsx` — shared by the home page and `/paths`. Renders the
  Stolzl «المسار ٠١» eyebrow, the level pill, up to three numbered steps, and a
  `courses_count` / `total_minutes` footer.
- `frontend/web/src/pages/Paths.jsx` and `PathDetail.jsx`, routed at `/paths` and `/paths/:slug`
  in `App.jsx`. The 23 pre-existing routes are untouched.
- `.grid-3` and `.grid-5` in `frontend/web/src/theme/global.css`, collapsing at the existing
  900px and 640px breakpoints. `minmax(0,1fr)` so a long Arabic title cannot widen a column.

## Decisions

- Arabic-Indic numerals come from `Intl.NumberFormat('ar-EG')`, not a hand-written digit table.
- `SectionHeading` was retuned to the design's scale (25px/700 rather than 30px/900). It is shared,
  so every page picks the new scale up — which is the point of a redesign.

## Acceptance check

```bash
cd /development/projects/baytara/frontend/web && npm run build
```

Then visit `/paths` and `/paths/<slug>` and confirm the step order matches the admin editor.
