# mobile-04 — Learning, progress and certificates

**Status:** done

## Goal

Show a learner where they left off, what they are enrolled in, and what they have earned.

## The finding that shapes this screen

**A free course produces no enrolment at all.**

`POST /enrollments` for a course with no fee returns `200 {"enrollment": null, "free": true}`
and records nothing. The backend states the reasoning outright: *"A course with no fee is not
joined at all... An enrollment only ever means 'this seat was bought'."*

Three consequences the UI has to respect:

1. **`enrollment: null` is success, not failure.** Reading the null as an error would show a
   failure message for the case that worked.
2. **Free courses never appear in "my courses"**, have no progress row and earn no
   certificate. An empty list is therefore not evidence the learner has done nothing, so the
   empty state says so rather than just "nothing here".
3. **`GET /progress` answers `enrolled: false` for a free course.** That is a normal answer,
   not an error, and the player still works.

## Other server semantics honoured

- **`expires_at: null` means lifetime access**, not "expired with no date".
- **An expired enrolment is still an enrolment.** The user is a past customer, so the tile
  offers **renewal** (`?kind=renewal`, priced at `renewal_percent()`), not a fresh purchase.
- **A streak day means a video was *started* that day.** Browsing does not count, and
  yesterday still counts, so the streak does not read as broken before today's first lesson.
- **`watched_hours` is floored to whole hours** server-side.
- **`watched_seconds` is a high-water mark** on `POST /progress` (the server takes the max),
  so posting a smaller figure after a rewatch cannot lose progress.
- **Certificates are idempotent.** `issue_certificate_if_earned` returns null on a
  re-completion rather than minting a second one, so the response's `certificate` field is
  "newly earned", not "has one".
- **`/video/my-progress` returns `{videos: [...]}` capped at 10**, deduped by video.
- **A certificate exposes only the learner's name and the course.** That is the whole point
  of the serial: verification without revealing an account.

## A robustness bug the tests caught

`Enrollment.fromJson` cast nested objects with `as Map<String, dynamic>`. `jsonDecode`
happens to produce exactly that, so it would have worked in production, but it throws on any
other map shape. Replaced with a `_obj()` helper that accepts any `Map` and casts safely.
Brittleness with no upside.

## What was built

```
lib/features/learning/
  data/learning_dto.dart             enrolments, progress, summary, certificates, history
  data/learning_repository.dart      the six endpoints
  application/learning_providers.dart
  ui/my_learning_screen.dart         resume card, stats, enrolments, certificates
  ui/certificate_screen.dart         holder view and public verification, same screen
```

## Tests

`flutter test` — **131 passing** (118 from mobile-00..03, 13 new), `flutter analyze` clean.

`learning_test.dart` covers: a free course's null enrolment read as success; lifetime vs
expired; string lesson keys becoming ints; `enrolled: false` as a normal answer; the 90%
finished threshold and an explicit `completed_at` below it.

## Acceptance check

```bash
cd mobile_app && flutter test && flutter analyze && flutter build apk --debug
```

## Deferred

The activity feed has a repository method but no UI section. It is a derived, time-sorted
list over three sources the other screens already show, and it adds no rule the app has to
respect. Payments history is milestone 5, where the rest of the payment shapes live.
