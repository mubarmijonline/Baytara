# mobile-06 — Veterinary verification

**Status:** done

## Goal

Let a user prove they are a veterinarian, through any of the three routes the server
accepts, and report the answer honestly.

## Three outcomes, not two

This is the whole milestone. `POST /baytarian/card` and `POST /baytarian/document` return:

| | |
|---|---|
| **201** | verified now, as a veterinarian or as a student |
| **202** | `{pending: true}` — a human will decide |
| **422** | could not verify, with a `report` or `verdict` explaining why |

**202 is neither success nor failure**, and collapsing it into either is the expensive
mistake:

- treated as **success**, the user is told they are verified when they are not, and then
  finds vet content still locked;
- treated as **failure**, they resubmit, and the second attempt is refused with
  `request_pending` — so they are stuck with an error they cannot clear.

So it is its own outcome with its own screen, and the copy says explicitly: *a colleague will
review it, the answer arrives in your notifications, do not submit again.*

A related trap: `202` is a **2xx**, so Dio does not throw on it. It arrives as an ordinary
response and has to be recognised, not assumed to be success. `422`, meanwhile, *is* thrown
but is a real answer carrying a report, not a transport failure, so it is caught and
converted rather than surfaced as an error.

## The flow refuses itself before wasting the user's time

Two server states would refuse a submission after the user had already photographed
everything: `already_verified` (409) and `request_pending` (409). The screen checks
`GET /baytarian/me` first and shows a notice instead of the form. Failing after a capture,
an upload and a forty-second read would be a poor way to learn there was never a point.

## Long work has to look alive

Reading a document takes **10 to 40 seconds**. The processing screen shows:

- **real byte progress** from Dio's `onSendProgress` while the file uploads (a determinate
  spinner), then
- an **indeterminate spinner and an honest elapsed-seconds counter** once the bytes are up
  and the server is reading, because at that point we genuinely do not know how far along it
  is, and a progress bar that has stopped at 100% reads as frozen.

The receive timeout is widened to 120s for these calls. The default 60s would abort a slow
read and tell the user it failed while the server was still working.

## Other details taken from the server

- **The syndicate card has its own endpoint** and sends no `route` field; `national_id` and
  `other` post to `/baytarian/document` with `route` set. `DOC_ROUTES` is exactly
  `{national_id, other}`.
- **A card preview endpoint exists** (`/baytarian/card/preview`) that reads without
  committing. Wired in the repository so a future "check before you submit" step needs no
  new plumbing.
- **`is_vet_student` gates nothing.** Both grants confer the same access; only the label on
  the result screen differs.
- **A missing request status parses as `pending`**, the safe reading. Defaulting to
  `approved` would imply access the server has not granted.
- **`national_id_required` (422)** is a real precondition for the national-ID route and gets
  its own copy pointing at the profile, not a generic validation message.
- **`503`** from the reading service is transient and says so, rather than telling the user
  their document was rejected.

## What was built

```
lib/features/verification/
  data/verification_dto.dart          three routes, three outcomes, status
  data/verification_repository.dart    card, preview, document; 202 and 422 handling
  application/verification_controller.dart  upload progress then elapsed counter
  ui/verify_screen.dart               route picker, capture with live preview, processing, result
```

Captures are taken at up to 2400px and 88% quality: large enough for the reader, small
enough not to take a minute on mobile data. Each slot shows the photo back immediately, so a
blurry or cropped shot is caught before the upload rather than forty seconds later.

## Tests

`flutter test` — **159 passing** (147 from mobile-00..05, 12 new), `flutter analyze` clean.

`verification_test.dart` covers: sent-for-review is not verified and is distinct from
could-not-verify; a pending request blocks a new submission while a rejected one does not;
both grants count as verified; a missing status defaults to pending.

## Still to verify on hardware

- [ ] Camera capture and gallery picking on a real device, including permission prompts.
- [ ] A real card read end to end, and that the elapsed counter matches the actual wait.
- [ ] An upload that outlives a token refresh (the file must not be lost to a 401 mid-flight).
- [ ] All three outcomes rendered from real server responses, especially the 202.
