# 06 — Home page rebuild

**Status:** done

## Goal

Rebuild `frontend/web/src/pages/Home.jsx` to the approved «مسار» design, with every visible
number and string coming from Postgres or the settings CMS.

## Sections, and where each one's data comes from

| Section | Source |
| --- | --- |
| Hero copy, CTAs, trust chips | `settings.hero` (incl. the new `hero.trust`) |
| Resume card | `GET /api/v1/learning-summary`, or `hero.featured_*` when signed out |
| Stats band | `settings.stats` |
| Paths | `GET /api/v1/paths`, first three |
| Categories | `GET /api/v1/categories` + `lib/category-images.js` |
| Free videos | `GET /api/v1/videos?access_type=free&per_page=3` |
| Instructors | `GET /api/v1/instructors`, first five — real course and student counts |
| Testimonials | `settings.testimonials` |
| Business banner | `settings.business` incl. `business.stats` |
| Closing CTA | `settings.home.cta_*` |

## What was deleted

The design has no course carousel, so `Home.jsx` no longer fetches `/courses`; `Carousel` and
`CourseCard` left the page. The fake category course counts, the instructor avatar gradients and
the testimonial gradients are gone — avatars fall back to `gradients.avatar`. `bizStats`,
`rawInstructors`, `testimonials`, `footerCols` and `socials` were removed from
`frontend/web/src/data/mock.js`; `stats`, `categories` and `rawCourses` stay because other pages
still import them.

## New components

- `components/ResumeCard.jsx` — one shell, two states. Real lesson, index, progress bar and the
  three counters when `summary.resume` exists; the CMS featured course otherwise, never zeros.
- `components/VideoCard.jsx` was edited, not forked: a duration pill from `duration_minutes`,
  the design's dark play circle, and 15px/12.5px type. `/videos` picks the same card up.

## Deviations from the mock, and why

- **The testimonials block keeps a heading.** The mock has none, but `home.testimonials_title` is
  an editable CMS field with a test guarding it; rendering nothing would have made the field dead
  weight. It renders only when set.
- **Category tiles are `<button>`s, not links.** They navigate to `/videos?category=<slug>`; the
  existing `videos.test.jsx` drives them by role, and a button is what they already were.

## Acceptance check

```bash
cd /development/projects/baytara/frontend/web && npm run test
```

`src/pages/home.test.jsx` asserts the paths section renders real step titles and a computed
"3 courses · 14 h" line, that a signed-out visitor sees the CMS trust chips and featured card and
never calls the authed endpoint, and that a signed-in learner sees the real lesson index, the
three counters, and a resume link to `/learn/<course>/<lesson>`.
