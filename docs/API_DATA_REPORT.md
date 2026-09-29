# API data report

Date: 2026-08-20. Requested after the app showed empty Courses and Content tabs.

Every figure below was taken by calling the **live** API at `https://baytara.app/api/v1`
directly with curl, not through the app.

## Summary

**The app is rendering the API correctly. The endpoints are healthy; the catalogue is
almost empty.**

`GET /courses` returns `total: 0`. There are no published courses at all, so an empty
Courses tab is the accurate result. The same is true of the Content tab: there are no
published articles.

## What the API actually returns

| Endpoint | Result |
|---|---|
| `GET /categories` | **6** categories |
| `GET /courses` | **0** — `total: 0`, `pages: 0`, every facet count zero |
| `GET /videos` | **2** |
| `GET /articles` | **0** |
| `GET /articles?kind=content` | **0** |
| `GET /articles?kind=blog` | **0** |
| `GET /bundles` | **0** |
| `GET /paths` | **0** |
| `GET /instructors` | **3** |
| `GET /health` | ok |

### The two videos that exist

| id | title | access | has_video | can_play (anonymous) |
|---|---|---|---|---|
| 3 | الحمى الثلاثية في الابقار | `free` | yes | false |
| 2 | Introduction | `free` | yes | false |

`can_play: false` for an anonymous caller is **correct**, not a fault: `free` means "anyone
with an **account**", and the server also requires a phone number before it will mint a video
OTP. Both play once signed in with a phone on the account.

### Categories are mostly empty

Only `large-animals` has content, and only 2 videos. The other five report `video_count: 0`:

`equine`, `pet-animals`, `poultry`, `fish-other-animal-sources`, and the sixth category.

Tapping any of those five leads somewhere genuinely empty.

## Conclusion, in one line

Nothing here is an API defect. **This is a content problem: courses and articles have not
been published.** Either the catalogue was never populated on this environment, or the rows
exist but are still `draft` — `GET /courses` filters on `status = "published"`, so a course
left in draft is invisible to every client including the website.

**Worth checking in the admin panel:** whether courses exist in `draft`. If they do,
publishing them makes them appear in the app immediately, with no app change.

## One real app bug this surfaced

`LEVELS` in `backend/app/models/catalog.py` is
`("beginner", "intermediate", "advanced", "breeders")`.

The app's course filter offered only the first three, so a course at the **`breeders`** level
could never be filtered for. Fixed.

## Two dead links found while auditing, both now fixed

Not data problems, but found in the same pass and worth recording:

1. **`/videos/<id>` had no route.** Every video card pushed it, so tapping any video did
   nothing. A video detail screen now exists.
2. **`/pricing` had no route**, and the player's refusal screen sends a would-be buyer
   there. Now implemented.

## Verifying this yourself

```bash
curl -s "https://baytara.app/api/v1/courses?per_page=50" | python3 -m json.tool | head -20
curl -s "https://baytara.app/api/v1/videos?per_page=50" | python3 -m json.tool | head -30
curl -s "https://baytara.app/api/v1/categories" | python3 -m json.tool
```
