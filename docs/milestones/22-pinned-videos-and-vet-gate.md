# 22: Videos the admin puts first, and a vet-only lock that says what to do

**Status:** done and live. Backend 353 tests, website 106, app 262, pinning panel 2.
The admin suite's failures (13 across five files, four more and a hanging test in the
video library file) are identical at the previous commit, so predate this work; see the
note at the end.
Migration `b148cdf18f16` applied; API, website and admin deployed. App change is in the
branch and ships with the next build.

## Goal

Two client requests from 2026-09-28:

1. For launch, put two or three platform-introduction videos first on the home page strip
   ("تعرّف على المنصة") and in the video library, with the rest following.
2. Replace "مطلوب الوصول" on a vet-only video with a message that names the action:
   "وثّق حسابك كطبيب بيطري للمشاهدة", plus a button, "توثيق الحساب الآن", that opens
   verification.

## Pinning

`lessons.library_rank`: 1 is first, null is not pinned. A new column rather than reusing
`position`, which already means the order inside a course unit; one video can sit in a
course and be pinned in the library, and the two orders must not fight.

The public `/videos` default order is `library_rank ASC NULLS LAST, created_at DESC`. The
home strip asks the same endpoint with `uncategorized=1`, so one ordering serves both places,
with one consequence the admin panel states: the strip only ever shows videos filed under no
section, so a pinned video that has a section leads the library but not the strip.
An explicit sort a visitor picks (oldest, longest, shortest) is honoured as asked, because
forcing pinned videos to the top of "longest first" would make that sort look broken. The
app sends `sort=newest`, which is not an explicit override, so it gets the pinned order too.

`PUT /admin/videos/pinned {video_ids}` sets the whole list in one call: a video left out is
unpinned. Duplicates, unknown ids and more than 12 are refused. Twelve is a ceiling, not a
target: a shelf where everything is pinned has nothing pinned.

**Admin:** a panel at the top of the video library. Search a published video, pin it, move
it up or down, remove it, save. A pinned video that is later unpublished is flagged in the
panel, since visitors will not see it.

## The vet-only lock

The website's lock resolved every non-anonymous case to the same "Access required" title.
It now picks one of four explanations, in the order a viewer has to clear them: no account,
no phone, not verified, anything else. The verification case uses the client's wording and
its button goes to `/verify?next=<this video>`, so the viewer comes back to the video.

The app's buttons use a new `verifyToWatch` string. The old `lockNeedsBaytarian` stays as
the short badge on cards, pricing and the how-it-works screen, where a sentence would not fit.

## Verified against the live site

- Pinned videos 5 and 33: the library and `sort=newest` (the app) led with `[5, 33]`, the
  home strip led with 33 (5 has a section), `sort=oldest` was unaffected. Cleared afterwards;
  the library returned to newest first.
- The vet-only video page shows the new title and button for a signed-in, unverified viewer.

## Pre-existing admin test failures, not from this work

Running the admin suite for this change found it does not finish: in
`tests/video-library.test.jsx` four tests fail (course assignment and three upload-flow
tests), and then "backfills canonical poster and duration" never completes, because the
editor re-renders continuously and starves the event loop, so even the test timeout cannot
fire. That test passes alone in 0.4 s. Across the other admin files, 13 tests fail. All of it
is identical when the same files are run from the previous commit, so none of it comes
from this change. Fixed in milestone 23, `23-admin-tests-and-app-parity.md`.
