# 12 — Lesson player rebuild

**Status:** done

## Goal

Rebuild `frontend/web/src/pages/Learn.jsx` to the design, with real progress and a real
curriculum, without touching the DRM contract.

## What landed

- **Lesson bar**: course title, «الدرس n من N» from the real video list, and a progress bar fed
  by `GET /progress?course=<slug>` — the page already fetched `percent` and threw it away.
- **Player**: unchanged contract. `<SecureVdoPlayer playback title onEnded onSecurityError />`,
  and the guard `!course || !isAuthed() || !activeLesson?.id || !activeLesson.has_video` still
  means a locked or anonymous viewer never reaches `/video/playback`.
- **Lesson block**: title, lesson number, duration, and a «قيد المشاهدة» chip derived from
  `watched_seconds > 0 && !completed` rather than assumed. Lesson descriptions now render —
  `Lesson.to_dict` has always returned them and the page ignored them.
- **Sidebar, two tabs**: «هذه الدورة» is `CurriculumAccordion` in `dense` mode, grouped by unit
  with completion ticks; «كل المحتوى» is the new `LibraryBrowser.jsx` — debounced search,
  All/Courses/Videos, and category chips over the existing `/courses` and `/videos` endpoints.

The mock `curriculum` fallback is gone, so a failed fetch shows a 404 instead of another
course's lessons.

## Decisions

- **The route shape is unchanged**: `/learn/:courseId/:lessonId`. `home.test.jsx` asserts
  `/learn/repro/42` and the home page's resume card deep-links straight into it.
- **The nine playback refusal messages moved into `DICT`.** They were hardcoded Arabic, so an
  English visitor got Arabic errors on the one screen where the message decides what they do next.
- **`primeAudioWatermark()` still fires inside the click handler**, not in an effect — iOS only
  unlocks audio during a user gesture.
- **«ملاحظاتي» is not built.** It needs its own table, editor and sync; it was explicitly out of
  scope for this pass.

## Acceptance check

```bash
cd /development/projects/baytara/frontend/web && npm run test
```

`src/pages/learn.test.jsx` covers: no playback request for an anonymous viewer; the OTP reaching
the iframe and the real 50% progress for a signed-in one; unit grouping plus navigation to
another lesson; and the all-content browser as the second tab.
