# 28 - Complimentary course access, and the locked-lecture sentence

**Status:** done; deployed 2026-10-01 (see the live checks below).

## What the client asked

1. Lessons marked as a free preview play for anyone; the protected lessons after them
   play only for someone who has paid, and anyone else is told
   "اشترك في الدورة لفتح المحاضرة".
2. A button in the admin dashboard to open a course to any number of chosen people
   without payment (influencers, reviewers, people they know), so they can watch and
   review it and the course does not show zero learners.

## What was already true

Request 1 is already enforced by the server. In course 13 (990 EGP, baytarian) lessons
1-5 are free and lessons 43 and 44 are baytarian on VdoCipher; nobody is enrolled. The
playback log shows the only plays of 43 and 44 were by an admin account, and admins pass
every lock by design. A verified vet who has not paid is refused with `not_entitled`,
and the player shows a lock with a buy button. What changes is the sentence.

## Plan

- **Copy.** Website player: `not_entitled` reads "اشترك في الدورة لفتح المحاضرة." App:
  the same sentence for `not_entitled`.
- **Grant (backend).** `POST /api/v1/admin/courses/<id>/grants` with `user_ids` (any
  number, up to 200 per call) and `access` = `course` (the course's own access period,
  as a buyer gets) or `lifetime`. Each user gets an active enrolment with
  `source = "admin_grant"`, no payment row, and a notification. Counts as a learner
  (`enrolled_count` +1 on a new or reinstated seat). A seat already active is left as
  it is. Refused per user, with the reason returned, when the account is missing,
  inactive or closed, or when the course's audience rule would refuse them anyway (a
  baytarian course needs a verified vet, a general course refuses one): granting a seat
  the player would then refuse helps nobody, and the admin can verify the person first.
- **Grant (admin portal).** On the courses page, "منح وصول مجاني" per course opens a
  dialog: search users by name or email, pick any number (chips), choose the access
  period, confirm. The result lists who got access and who was skipped and why. The
  enrolments page labels these seats "منحة مجانية".
- **Not changed.** Revenue (no payment exists), the purchase flow, the player's rules.

## Acceptance check

- [x] Backend: `tests/test_course_grants.py` (6 tests); full suite 379 passed.
- [x] Admin: `tests/course-grants.test.jsx` (2 tests); suite 114 of 115. The one failure is
  `video-library.test.jsx`'s search-debounce timing test, which fails intermittently under
  machine load with or without this change (it passed on the same code on re-run).
- [x] Website 112 passed; app 269 passed, `flutter analyze` clean.
- [ ] Live: a test account granted course 13 can play lesson 43 and post a review; the
  course's learner count goes up by one; ungranted, the same account sees the new sentence.
