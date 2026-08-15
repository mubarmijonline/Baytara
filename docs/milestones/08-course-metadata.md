# 08 — Course metadata and units

**Status:** done

## Goal

Give the course page real answers for the things it was inventing: what you will learn, the
level, when the course was last updated, and how the curriculum is structured.

## What landed

New columns on `courses` (`backend/app/models/catalog.py`), migration
`b5e2f81ac934_course_metadata.py`:

| Column | Note |
| --- | --- |
| `objectives` / `objectives_en` | JSON lists. `loc()` treats an empty list as falsy, so an unfilled English list falls back to Arabic like every other paired field. |
| `level` | validated against the shared tuple |
| `has_certificate` | the only honest source for the certificate row |
| `updated_at` | `default=_now, onupdate=_now`, mirroring `Lesson.updated_at` |
| `rating_sum` / `rating_count` | running totals, filled in by milestone 09 |

`PATH_LEVELS` became **`LEVELS`** now that both `Course` and `LearningPath` use it, and the
frontend `DICT` keys moved from `paths.level.*` to `level.*`.

`Course.to_dict` gained `objectives`, `objectives_en`, `level`, `has_certificate`, `rating`,
`reviews_count`, and — with `with_content=True` — `modules`, `all_modules` and
`content_updated_at`.

## Decisions

- **`content_updated_at` is `max(course.updated_at, max(lesson.updated_at))`.** Adding a lesson
  is an update to the course as far as a learner is concerned; a bare row timestamp would claim
  a course was untouched while its content changed.
- **`rating()` returns `None`, never `0`.** A zero reads as a badly-rated course rather than a
  new one, and the frontend hides the tile on null.
- **The «تشمل هذه الدورة» rows are derived at render time, not stored.** Only the access window,
  the device allowance, the lesson/hour counts and the certificate flag. The design's
  downloadable-resources and community-support rows have no backing and were dropped.

### Units belong to the assignment, not the video

The first cut grouped by `lessons.module_id` and was wrong: a video reused by three courses
would have been forced into one global unit. Migration `d1f0c62b8a47_course_video_units.py` adds
`course_videos.module_id`, so a shared video can be unit 1 here and unit 3 elsewhere. The
migration carries over any legacy lesson-level grouping, but only where the module actually
belongs to the same course.

`grouped_videos()` walks the same dedupe order as `content_videos()`, so the grouped view and
the flat `videos` list always hold the same rows. Anything not placed in a unit lands in one
leading group with a null id, which the frontend renders as a single implicit unit.

`all_modules` exists because the grouped list drops empty units — which would have hidden a
unit the admin had just created.

## Acceptance check

```bash
cd /development/projects/baytara/backend && .venv/bin/python -m tests.test_course_detail
```

Covers the metadata fields, `?lang=en` objectives, the flat list surviving beside the grouped
one, the implicit unit leading, a rejected bad level, blank objectives being trimmed away, and
moving a video into a unit for one course only.
