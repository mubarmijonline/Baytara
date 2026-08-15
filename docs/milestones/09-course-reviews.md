# 09 — Course reviews

**Status:** done

## Goal

Make the star rating and the «آراء المتعلّمين» section real. Before this, both came from three
fixed mock reviews shown on every course — and the mock array was not even imported, so that
branch threw a `ReferenceError`.

## What landed

`CourseReview` in `backend/app/models/catalog.py`, migration `c8d4a1b70e55_course_reviews.py`:
`course_id`, `user_id`, `rating` (1-5), `body`, `status` (`published|hidden`), timestamps, and a
unique constraint on `(course_id, user_id)`.

Public, in `backend/app/api/v1/courses.py`:

- `GET /api/v1/courses/<slug>/reviews` — published only, newest first, paginated
- `POST /api/v1/courses/<slug>/reviews` — requires an active unenexpired enrollment
- `DELETE /api/v1/courses/<slug>/reviews/mine`

Admin, in `admin.py`: `GET /admin/reviews` (`?status=`, `?course_id=`),
`PATCH /admin/reviews/<id>`, `DELETE /admin/reviews/<id>`.

## Decisions

- **Only an enrolled learner can review.** Anonymous gets 401, a non-enrolled account gets 403
  `not_enrolled`. A review on a course you never bought is not a review.
- **One review per learner; a second POST edits the first.** The unique constraint makes that a
  fact rather than a convention.
- **Moderation is publish-then-hide, not a pending queue.** A review appears immediately and an
  admin can pull it. A queue would need a notification path nobody asked for.
- **`refresh_course_rating` recounts rather than applying a delta.** Writes are rare and reads
  are on every card, so the cheap thing to keep correct is the read — and a recount cannot
  drift. Hiding a review recounts too, so the average always matches what is readable.
- **Counters are denormalised onto `courses`.** A listing renders up to 50 cards; a per-card
  aggregate would be a 50-query page.

## Acceptance check

```bash
cd /development/projects/baytara/backend && .venv/bin/python -m tests.test_reviews
```

Covers: unrated courses report `null` not `0`; anonymous and non-enrolled are refused; ratings
outside 1-5 (including `"5"` and `true`) are refused; the body is trimmed; a second POST edits
rather than stacks; a second learner moves the average; hiding recomputes it; non-admins cannot
moderate; and withdrawing your own review returns the course to unrated.
