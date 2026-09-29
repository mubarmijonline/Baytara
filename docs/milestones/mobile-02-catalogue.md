# mobile-02 — Catalogue

**Status:** done (screens for bundles, paths, instructors and articles deferred, see below)

## Goal

Browse everything the website's public catalogue offers, with the access rules rendered
honestly on every card, so a user never taps a button the server would refuse.

## The finding that shaped this milestone

`docs/FLUTTER_APP_PROMPT.md` §3.2 says: *"Every video/course carries the access flags the UI
must obey: `can_play`, `requires_auth`, `requires_phone`, `access_type`."*

**That is only true of `/videos` and `/videos/<id>`.** Those two endpoints run responses
through `_public_video_dict` (backend/app/api/v1/video.py), which adds the three flags.
Everything else — `Course.to_dict`, `Lesson.to_dict`, and therefore every video **inside a
course tree** — carries `lock_reason`, `is_paid` and `access_type` and no `can_play` at all.

Taken at face value, the doc leads to `video.can_play == true` guarding a play button that
is null for every lesson in every course, which fails closed and silently: every lesson
looks locked. Or worse, `!= false`, which fails open.

So playability is **derived** in one place, `lib/core/access/access.dart`, mirroring
`audience_error` plus the phone gate. Deriving it per widget is how two screens end up
disagreeing about the same lesson.

## The access rules, and the one that reads backwards

From `ACCESS_AUDIENCES` in backend/app/services/catalog_access.py:

| tier | who |
|---|---|
| `free` | anyone with an account |
| `vet_free` | free, but verified vets only |
| `baytarian` | paid, verified vets only |
| `general` | paid, and **a verified vet is refused it** |

`general` is the trap. It is the paid tier for people who are *not* veterinarians, so a vet
looking at it must be told the tier is for non-vets, **not** shown a price and a Buy button.
`_Cta` in the course page returns a notice with no button at all for that case, and
`CourseCard` suppresses the price. There is a test asserting a vet is never offered a
purchase for `general`, including when a stale entitlement says otherwise.

Two more ordering rules, both taken from the server:

- **The audience rule is checked before the price.** A non-vet looking at `baytarian`
  content is told to get verified, not asked to pay for something verification still gates.
- **`is_vet_student` gates nothing.** Students and licensed doctors reach identical content;
  the flag only records which kind of vet. A test asserts the two resolve identically across
  all four tiers.

## Facets are read, not computed

`GET /courses` returns a `facets` block: `{level: {...}, access_type: {...}}` with counts,
and the server computes each dimension **with its own filter excluded**. That is what makes
ticking "beginner" leave the other level counts intact instead of zeroing them.

The filter sheet prints those numbers as sent. Deriving them from the loaded page would be
wrong twice over: the page is one slice of the results, and the exclusion logic would be
lost. A zero count is shown rather than hidden, because it tells the user a combination is
empty before they apply it.

This block is not mentioned in the contract doc either.

## Other server details the UI has to respect

- **`rating` is null, never 0, for an unrated course.** The server does this deliberately:
  a zero would read as a bad course rather than a new one. Cards print "new" instead.
- **`access_days` null means lifetime**, not zero days.
- **`video_minutes` is the real summed length; `duration_minutes` is what an admin typed.**
  Cards prefer the real figure and fall back to the typed one only when nothing is attached.
- **A duration of 0 means unknown**, which is why it is excluded from every duration band
  server-side and prints as nothing rather than "0m".
- **A missing `access_type` parses to `general`**, the paid tier. Failing closed.
- **Video sorts differ from course sorts.** `/videos` offers newest/oldest/longest/shortest;
  there is no `popular` or `rating`.
- **The token is sent on these public endpoints even though they accept anonymous callers**,
  because the server changes what it returns: a signed-in non-vet is not shown `vet_free`
  items at all, and `lock_reason` is computed per user.

## What was built

```
lib/core/access/access.dart                    the single derivation of AccessState
lib/features/catalogue/
  data/catalogue_dto.dart                      Course, Video, Category, Paged, Article
  data/catalogue_repository.dart               listings, detail, settings, contact
  application/catalogue_providers.dart         accumulating paged listings
  ui/home_screen.dart                          hero + categories + course shelf, /settings driven
  ui/courses_screen.dart                       search, full filter sheet, facet counts, paging
  ui/course_detail_screen.dart                 tree, instructor, access-driven CTA
  ui/videos_screen.dart                        search, category chips, paging
  ui/widgets/access_badge.dart                 tier chip + lock line
  ui/widgets/course_card.dart                  course and video cards
```

Listings accumulate rather than replace, and paging starts 600px before the end so the next
page is usually there by the time the user arrives.

## Tests

`flutter test` — **77 passing** (43 from mobile-00/01, 34 new), `flutter analyze` clean.

| File | Covers |
|---|---|
| `access_state_test.dart` | all four tiers against five kinds of user; `general` never offers a vet a purchase; vet students match licensed vets exactly; the phone gate blocks even free content; a server `lock_reason` and `can_play` both outrank the local rule |
| `catalogue_test.dart` | rating null stays null; `access_days` null is lifetime; real length beats typed length; a course-tree video has no `can_play`; facet block parsing including a zero count; blank filters omitted rather than sent empty |

## Acceptance check

```bash
cd mobile_app && flutter test && flutter analyze && flutter build apk --debug
```

## Deferred, and why

Bundles, learning paths, instructor profiles and articles have **repository methods and DTOs
but no screens yet**. They are list-and-detail pages over endpoints already wired, and they
carry none of the access subtlety above. Building them before the player would put the
milestone's remaining risk in the wrong place: mobile-03 is where DRM, heartbeats and the
capture guards live, and that is the work most likely to need room.

The Content tab still renders a placeholder for the same reason.

## Still to verify on hardware

- [ ] Arabic RTL layout of the filter sheet and the card rows on a real screen.
- [ ] Long Arabic course titles at two lines, and mixed Arabic/Latin titles.
- [ ] Image loading over a slow mobile connection, and the gradient fallback for the many
      catalogue items with no artwork.
