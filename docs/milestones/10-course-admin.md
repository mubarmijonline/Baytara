# 10 — Course admin

**Status:** done

## Goal

Make everything milestones 08 and 09 added authorable, so the course page has content to show.

## What landed

- **Course editor** (`frontend/admin/src/pages/Courses.jsx`): level select, certificate
  checkbox, and two objectives textareas (Arabic and English). One bullet per line is the
  cheapest editor that round-trips a list; blank lines are dropped server-side by `_objectives`.
- **Units** (`frontend/admin/src/pages/CourseContent.jsx`): create, rename and delete units, plus
  a per-video unit select on each ordered row. Backed by the module routes that already existed
  (`admin.py:336-376`) plus one new endpoint,
  `PUT /admin/courses/<cid>/videos/<vid>/module`, which refuses a unit belonging to another
  course.
- **`Reviews.jsx`**: list, filter by status, publish/hide, delete. Routed at `/reviews` with a
  `Star` nav entry.
- `Field` in `ui.jsx` gained an optional `hint`.

## Decisions

- The units panel states, in the UI, that a unit belongs to this course alone — the same fact
  the `course_videos.module_id` design encodes, where an admin will actually read it.
- Deleting a unit leaves its videos in the course, ungrouped (`ondelete='SET NULL'`), so a
  mis-click cannot drop content.

## Acceptance check

```bash
cd /development/projects/baytara/frontend/admin && npm run build
```

Then: create two units on a course, move videos between them, and confirm the public
`GET /api/v1/courses/<slug>` groups them the same way; post a review as an enrolled learner and
hide it from `/reviews`, then confirm the course average changed.
