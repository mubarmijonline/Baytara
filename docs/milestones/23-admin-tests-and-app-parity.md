# 23: Admin tests green again, and milestone 22 in the app

**Status:** done. Admin suite 109 tests across 8 files, all passing in about 80 s (it
previously never finished). App 265 tests. Admin deployed; the app changes ship with the
next build.

## App parity with milestone 22

- **Home, "تعرّف على المنصة".** The website home has had this strip since the platform
  clips were added; the app's home did not, so pinning reached only its library. It now
  sits between the categories and the video shelf, as on the site, and asks the same
  thing the site asks: `/videos?uncategorized=1&per_page=4`, with no sort, because the
  server's default order is the one that puts pinned videos first. Absent, not empty, when
  there are none.
- **Vet-only lock.** The video page and the course page show the website's two parts, the
  sentence "وثّق حسابك كطبيب بيطري للمشاهدة" and a "توثيق الحساب الآن" button, in place of
  a lone button carrying the sentence. The player's lock keeps its message and uses the
  same button label; `errNeedsBaytarian` now ends with the same instruction.

## Admin tests

Every failure was diagnosed against the code as it is now, before anything was changed.
Two were real bugs; the rest were tests still asserting behaviour that had been changed on
purpose.

### Real bugs, fixed in the page

1. **The video editor reloaded itself, and could do so for ever.** Opening a video with no
   poster or duration makes the editor fill them in from VdoCipher. That save fired the
   admin's data-changed event, which remounts the active page, which reloads the video,
   which repairs it again. With a real server this cost one surprise reload, enough to
   lose whatever the admin had started typing. Whenever the next load still lacked the
   poster it never stopped, and this is what hung the test file: the loop kept the event
   loop too busy for even the test timeout to fire. The repair is now `silent`, like the
   upload page's create, and the form is updated with what was filled in so a later Save
   does not send the old empty values back. The test counts page loads: 4 in 200 ms
   before, 1 after.
2. **The upload queue did not resume after a paid tier was corrected.** Choosing a paid
   access tier on the upload page is refused, since that page uploads to our server,
   which has no DRM. The auto-start re-checked on section and presenter changes but not on
   access-type changes, which is the one thing it checks. Switching back to free left the
   queue sitting there until the file was picked again. Proven by the test failing
   without the fix.

### Tests brought up to date with deliberate changes

| Test | Asserted | Changed on purpose in |
| --- | --- | --- |
| Upload queue: category and instructor required | both required | 0a428a9, both optional (platform clips) |
| Articles heading and sidebar link | "Content and articles" | eefe28d, "Baytara Library" / "مكتبة بيطرة" |
| Vet queue: Document and Reject buttons in the row | in the row | 0a0a1a1, one Verify per row; the rest in Details |
| Course form instructor list | exact URL `?role=instructor` | dd1a49b, active instructors only |
| Video editor course assignment | any course offered | dd1a49b, only the video's instructor's courses |
| Upload flow: first file input is the video | true | 1a71993 added a thumbnail picker above it |
| Library filter drops a custom section's slug | dropped | 0a428a9, any existing section is a filter |
| Site settings "English title" | one on the tab | 5d46a7a added the courses page section |

For the last one the fix was partly in the page: each settings section is now a named
region, so a screen reader can tell the hero's "English title" from the courses page's,
and the tests look inside the hero region. The vet queue test also needed blob URLs
stubbed, which browsers have and jsdom does not.

One regression came from milestone 22 itself: the pinned panel's Arabic heading contained
"الفيديوهات", which the routing test also uses to find the videos page title. The heading
became "المثبّت في المقدمة".
