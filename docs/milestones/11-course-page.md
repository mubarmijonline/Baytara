# 11 — Course page rebuild

**Status:** done

## Goal

Rebuild `frontend/web/src/pages/CourseDetail.jsx` to the approved design, on real data.

## What the old page did

It rendered `rawCourses[0]` from `mock.js` on first paint and forever if the API failed, so a
real course flashed a different course's title, rating and learner count before settling. There
was no loading state and no 404. The objectives and includes rows were mock constants identical
on every course — and one of them ("وصول مدى الحياة") contradicted the access line 30 lines
above it whenever `access_days` was set. `reviews` was used but never imported, so the mock
branch threw `ReferenceError`.

## What landed

The mock fallback is gone: a real loading state, a real 404 via `NotFound.jsx`, and no
`rawCourses` import — which removes the crash with it.

| Section | Source |
| --- | --- |
| Breadcrumb, title, description | `category.name`, `title`, `description` |
| Hero tiles | `rating`/`reviews_count` (tile absent until the course has reviews), `lessons_count`, `video_minutes`, `enrolled_count` |
| Chips | `access_type`, `level`, `content_updated_at` |
| Purchase card | `image`, the first free lesson as the preview, `price`/`currency`/`is_paid`/`lock_reason`/`access_days` |
| Includes rows | derived: access window, devices, lesson/hour counts, certificate flag |
| ماذا ستتعلّم | `objectives`; the card is absent when empty |
| محتوى الدورة | `modules` via `CurriculumAccordion` |
| عن المحاضر | `/instructors/<id>` — `courses`, `students` and `expertise` are all real |
| آراء المتعلّمين | `GET /courses/<slug>/reviews` via `ReviewList` |
| دورات ذات صلة | `webapi.courses({ category, per_page: 4 })` minus self — no new endpoint |

New shared components: `CurriculumAccordion.jsx` (also the player sidebar, in `dense` mode) and
`ReviewList.jsx`.

## Decisions

- **The «أضف إلى المفضّلة» button is dropped.** There is no favourites table, and a button that
  does nothing is exactly what the old page already had.
- **Empty states are absences, not zeros.** No reviews means no star tile and no reviews block,
  rather than "0 ratings" — which reads as a bad course rather than a new one.
- `instructor.courses` and `instructor.students` come from `public_profile`, which already merges
  the real counts in; `instructorData.courses` is the course *array* and is not used for counts.

## Acceptance check

```bash
cd /development/projects/baytara/frontend/web && npm run test
```

`src/pages/course-detail.test.jsx` covers the API-not-mock render, the derived includes rows,
the unit grouping and free-preview badge, and both the rated and unrated variants.
