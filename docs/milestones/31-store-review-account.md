# 31 - App Store / Google Play review account

**Status:** done; deployed 2026-11-17.

## Goal

Apple and Google reviewers need one account that signs in on several devices, sees every
course it is allowed to see, and is not locked out of playback while they poke at the app.
One command makes that account, and running it again brings it back to the same state.

Why it matters: on 2026-11-13 Apple rejected build 1.0 (2) under Guideline 2.1 because
`appreview@baytara.app` could not sign in. The account already had two devices on the
default limit of two, so the reviewer's iPad got `device_limit_reached`.

## Plan

- **Command.** `flask create-review-account EMAIL NAME PHONE [--vet/--no-vet] [--apply]`. Dry run unless `--apply`, like `tools/seed_demo_content.py`.
  The password is asked for on the terminal twice (never an argument or an environment
  variable) and only on `--apply`. The account is always a student, active, not closed,
  with `is_review_account` set. An existing admin or instructor
  with that email is refused rather than demoted.
- **Verification.** `--vet` (default) verifies the account the same way the admin's
  "verify without a document" does: an approved request on the `admin` route. That logic
  moves into `services/vet_verification.py` and the endpoint calls it. `--no-vet` clears
  `is_baytarian` so the general courses are the ones it can open.
- **Courses.** Every published course goes through `grant_course(..., access="lifetime")`:
  paid ones as `admin_grant`, free and vet_free as `free` (a new `source` argument). The
  audience rule, the "already enrolled" skip and the learner counter are the grant's own.
  No payment row is ever made.
- **Devices.** A review account has no device limit: `UserDevice.limit_for` returns 1000
  for it, which every login and playback check goes through. An int rather than null,
  because the shipped app reads `max_devices` as a number.
- **Playback.** New column `users.is_review_account` (default false). Suspicious events are
  still recorded, but such an account is not refused with `suspicious_activity`. The OTP
  ceiling and one-stream rule are unchanged. The admin Users table shows a
  "Review account" chip.

## Acceptance check

- [x] `tests/test_review_account.py` (8 tests): creates the user; a second run changes
  nothing; `--vet` enrols free + vet_free + baytarian and skips general; `--no-vet` the
  opposite; never admin; three suspicious events block a normal student but not the
  review account; a normal student is refused a third device and the review account signs
  in on five. The last two fail with their exemption removed.
- [x] Backend suite 1271 passed (after rebasing on main); admin suite 115 passed. Migration `a4e7c2d9b1f3` upgrades,
  downgrades and upgrades again on SQLite.
- [x] Live (2026-11-17): deployed, migration `a4e7c2d9b1f3` applied. `appreview@baytara.app`
  (id 307, the account in App Store Connect, password unchanged) and a second account,
  `appreview2@baytara.app` (id 323), are verified review accounts with lifetime seats in all
  5 published courses and no payment rows. `appreview2` signed in on three device ids
  against https://baytara.app, all 200.
- [ ] Apple re-review of build 1.0 (2).

## Production

```bash
cd /development/projects/baytara/backend
FLASK_APP=wsgi.py .venv/bin/flask db upgrade
FLASK_APP=wsgi.py .venv/bin/flask create-review-account appreview@baytara.app "App Store Reviewer" +201001234567
FLASK_APP=wsgi.py .venv/bin/flask create-review-account appreview@baytara.app "App Store Reviewer" +201001234567 --apply
```

The first run prints what would change. The second asks for the password twice and writes.
Type the password that App Store Connect and Play Console already hold, or the
reviewers are locked out again. Re-run with `--apply` after new courses are
published to open them too; it asks for the password again and sets it to what you type.
