# 03 — Learning summary endpoint

**Status:** done

## Goal

Back the hero's «أكمل من حيث توقفت» card with real figures: which lesson is next, how far through
the course the learner is, how many courses they are enrolled in, how many hours they have
watched, and how many days in a row they have shown up.

## What landed

`GET /api/v1/learning-summary` (`@jwt_required()`) plus a `learning_summary(user_id, lang)` helper
in `backend/app/api/v1/learning.py`.

```json
{"courses_enrolled": 12, "watched_hours": 48, "streak_days": 7,
 "resume": {"course": {...}, "lesson": {...},
            "lesson_index": 6, "total_lessons": 15, "remaining_lessons": 9, "percent": 40}}
```

`resume` is `null` when there is nothing to resume, and the card falls back to its featured-course
variant rather than showing zeros.

## Decisions

- **No migration.** `video_playback_sessions` already records `started_at` (indexed),
  `watched_seconds`, `course_id` and `status` on every playback attempt; `lesson_progress`
  and `course_videos.position` already answer "which lesson is next"; `Enrollment.completion()`
  already computes the percent. Adding `enrollments.last_lesson_id` and a `user_activity_days`
  table would have duplicated data that is already being written.
- **Refusals do not count.** `denied` and `provider_failed` sessions are excluded from the streak
  and from the watched total.
- **Hours are lifetime, the streak is a walk backwards from today.** One unbounded query serves
  both; a date filter would have quietly turned the hours tile into "last 90 days".

## Known ceiling

A streak day means a video was *started* that day. Browsing the catalogue is not a streak day.

## Upgrade trigger

Recorded as a `ponytail:` comment on the helper: if a retention job ever starts pruning
`video_playback_sessions`, add a three-column `user_activity_days(user_id, day, unique)` written
from `start_playback_attempt`. The response shape does not change.

## Acceptance check

```bash
cd /development/projects/baytara/backend && .venv/bin/python -m tests.test_learning_summary
```

Seeds sessions on two consecutive days plus a `denied` one four days back, and asserts
`streak_days == 2`, `watched_hours == 3`, the resume lesson index, and that a learner with no
history gets zeros and `resume: null` rather than an error.
