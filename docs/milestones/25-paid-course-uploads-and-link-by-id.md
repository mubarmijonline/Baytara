# 25: Uploading into a paid course, and linking a VdoCipher video by its ID

**Status:** done and live (admin and website). No backend or app change.

## The upload that reached VdoCipher and then failed

The client, 2026-09-29: uploading a video into the paid course "Bovine Reproductive
Ultrasonography" showed the file arriving on VdoCipher, then the dashboard said "paid
content needs a price above zero", and the video was on VdoCipher but not on Baytara.

The course dialog creates the lesson only after the upload lands (VdoCipher needs the file
before there is anything to record). It sent the course's paid access type with
`price: 0`, and the import refused a paid video priced at zero. It had done this since the
dialog was built (877138a, 2026-09-08). No paid VdoCipher lesson existed in any course,
which confirms it had never once worked for a paid course.

A paid lesson now takes the course's price. That satisfies the rule without changing what
anyone sees or pays: a lesson inside a course cannot be bought on its own
(`video_not_standalone`), and the website never displays a lesson's own price.

**Recovery.** If creating the lesson fails after the file is on VdoCipher, the dialog
switches to linking with that video's ID filled in, so finishing is one click instead of a
second upload. The import is also silent now: its data-changed event remounted the page
mid-flow, so the course could reload before the video was attached.

The client's own upload is still on VdoCipher, unlinked: `7c583e07397548eba869c9a667aaae48`,
titled "Baytara", ready.

## Linking by VdoCipher Video ID

Asked for as a fallback in case the VdoCipher plan limits uploads from our site. The
client's upload shows it does not on this account, but the path is useful anyway: a video
uploaded in VdoCipher's own dashboard can now be added without downloading and uploading it
again.

- **Course dialog:** a third storage choice, "VdoCipher: a video already uploaded there".
  Paste the ID, press Check to see VdoCipher's title, length and status (and have the title
  filled in), then link. It is the same import an upload ends with, given an ID that is
  already there, so it pulls the poster and length from VdoCipher and gets the course's
  access and price like any other lesson.
- **New video page:** an "Already uploaded to VdoCipher?" box that opens the import screen
  the library already uses for a VdoCipher video with no Baytara record.

## Course page wording

The website's course page still read "خاص بالأطباء الموثّقين، وثّق حسابك للوصول" with a
"وثّق حسابك" button, and that button went to the pricing page. It now uses the milestone
22 wording ("وثّق حسابك كطبيب بيطري للمشاهدة" / "توثيق الحساب الآن") and goes straight to
verification, returning to the course. The app's course page already had this.

## The VdoCipher plan questions, and what is known

- **Uploads from our dashboard:** work on the current plan. The client's upload arrived.
- **App playback:** the app plays VdoCipher video through VdoCipher's Flutter SDK
  (`vdocipher_flutter`). VdoCipher's own pages do not state which plan includes the SDKs; a
  third-party pricing listing puts the mobile SDKs, and the upload API, from a higher plan
  than Starter. No VdoCipher video has been played in the app on this account yet (0 app
  sessions; 19 successful web plays), so it is unproven either way.
- **iPhone:** protection there depends on FairPlay, flagged in `mobile-08-ios-bringup.md` as
  needing written confirmation from VdoCipher for this account tier. Still outstanding.
- **Android:** the app's own screen block (`FLAG_SECURE`) does not depend on the plan.

The answer needs VdoCipher in writing, or a single test: one protected video played in the
Android app on this account.
