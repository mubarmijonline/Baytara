# 24: Pinning past four, and verification without a national ID

**Status:** done and live. Backend verification and pinning suites green, website suite
green, app analyzer clean and verification tests green. The app's copy change ships with
the next build; its behaviour change needs none, since it comes from the server.

## Pinning wiped the list on the fifth video

The client, 2026-09-28: four videos pinned and reordered fine; pinning a fifth left only
the fifth, as number one.

It was never a limit of four, and it was mine, from milestone 22. The save cleared every
rank with a bulk UPDATE, then assigned the new ranks to rows already loaded into the
session. Those rows still held their old ranks in memory, so a video that kept its place
was "set" to the rank it already appeared to have. SQLAlchemy saw no change and wrote
nothing, and the database kept the cleared value. Adding a fifth to four saved videos
kept the four in place, so exactly those four were lost. Any save that left a video where
it was would have dropped it; a swap of the first two in a list of three dropped the third.

The milestone 22 tests all started from nothing pinned, and so did the live check, which
is why none of them saw it. The fix clears ranks through the loaded rows, so the session
sees every change and writes the net difference. The new tests reproduce the client's
sequence, a reorder that leaves one video in place, and pinning 1 to 12 one save at a time
with a thirteenth refused.

## National ID no longer required to verify

The client: applicants are already arriving from Jordan, Mauritania and elsewhere, who
have no Egyptian number to type, and a syndicate card, college card or ID photo should be
proof enough on its own.

Before, the syndicate card route was refused with `national_id_required` unless a typed
number was saved on the profile, and the website greyed out the photo upload on both the
card and national ID routes until one was. The app has no field for it at all, so a card
sent from the app without a saved number was refused with nowhere to enter one.

Now:

- **Syndicate card.** A number on the profile is still matched against the card. With
  none, the number printed on the card must not belong to another account, and approval
  records it, write-once. That is the rule the document route already applied, and it is
  what keeps one card to one account alongside the registration and licence numbers.
- **Website.** The national ID step says "(optional)", explains that it can be left empty,
  and never blocks the upload.
- **The typed field keeps its Egyptian check** when someone does use it. It is matched
  against Egyptian cards and locks the account's identity, and a foreign number could be
  checked against nothing. An applicant from abroad leaves it empty.
- **Copy.** The "other document" route, on the site and in the app, now names a syndicate
  card or ID from another country, so an applicant from abroad can see which route is
  theirs. That route already verifies a doctor when the document shows one, and sends
  anything unclear to a person.

One consequence to know: without a typed number, a syndicate card is tied to whichever
account uses it first. The one-card-one-account check still holds, so a second account
cannot reuse it; a real owner who arrives second gets "already verified on another
account" and goes to support.
