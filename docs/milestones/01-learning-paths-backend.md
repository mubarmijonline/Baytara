# 01 — Learning paths backend

**Status:** done

## Goal

Give «مسارات» a real home in Postgres. A path is an ordered shelf of courses with a level and a
publish flag; it carries no price and no access tier, because every course inside it already
carries its own.

## What landed

- `LearningPath` and `PathCourse` in `backend/app/models/catalog.py`, plus the `PATH_LEVELS` tuple
  (`beginner`, `intermediate`, `advanced`, `breeders`). Exported from `backend/app/models/__init__.py`.
- Migration `backend/migrations/versions/a1c7f4e93d20_learning_paths.py` (on head `f7a3c8e21b40`).
  It seeds nothing — paths are editorial content.
- Public: `GET /api/v1/paths` and `GET /api/v1/paths/<slug>` in `backend/app/api/v1/courses.py`.
- Admin: `GET/POST /admin/paths`, `GET/PATCH/DELETE /admin/paths/<id>` in `backend/app/api/v1/admin.py`.

## Decisions

- **Steps are a join to `courses`, not free text.** The card prints a course count, a summed
  duration and a start destination; only real course rows can produce all three honestly.
- **`level` is an enum string, not a bilingual pair.** The visible pills live in the frontend
  `DICT`, so they are bilingual for free and the pill colour keys off the same value.
- **Draft courses are assigned but not counted.** `courses_count`, `total_minutes` and `steps`
  only include `status == "published"`, so a work-in-progress cannot inflate the card.
- `_bundle_ids` was reused rather than cloned — it is generic despite its name.

## Acceptance check

```bash
cd /development/projects/baytara/backend && .venv/bin/python -m tests.test_paths
```

Covers: title required, bad level/status rejected, unknown course id rejected, draft paths hidden
from the public API, step ordering preserved through a PATCH reorder, `?lang=en` returns the
English title, and delete removes it from the listing.

## Gotcha for future work

Replacing `path.course_assignments` inserts the new rows before the orphan deletes flush, which
trips `uq_path_course` on a reorder. `path_update` clears and flushes first. Any future reorder
endpoint needs the same shape.
