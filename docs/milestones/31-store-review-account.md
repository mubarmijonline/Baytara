# 31 - App Store / Google Play review account

**Status:** built and tested; not yet deployed.

## Goal

Apple and Google reviewers need one account that signs in on several devices, sees every
course it is allowed to see, and is not locked out of playback while they poke at the app.
One command makes that account, and running it again brings it back to the same state.

## Plan

- **Command.** `flask create-review-account EMAIL NAME PHONE [--vet/--no-vet]
  [--max-devices 10] [--apply]`. Dry run unless `--apply`, like `tools/seed_demo_content.py`.
  The password is asked for on the terminal twice (never an argument or an environment
  variable) and only on `--apply`. The account is always a student, active, not closed,
  with `max_devices` raised and `is_review_account` set. An existing admin or instructor
  with that email is refused rather than demoted.
- **Verification.** `--vet` (default) verifies the account the same way the admin's
  "verify without a document" does: an approved request on the `admin` route. That logic
  moves into `services/vet_verification.py` and the endpoint calls it. `--no-vet` clears
  `is_baytarian` so the general courses are the ones it can open.
- **Courses.** Every published course goes through `grant_course(..., access="lifetime")`:
  paid ones as `admin_grant`, free and vet_free as `free` (a new `source` argument). The
  audience rule, the "already enrolled" skip and the learner counter are the grant's own.
  No payment row is ever made.
- **Playback.** New column `users.is_review_account` (default false). Suspicious events are
  still recorded, but such an account is not refused with `suspicious_activity`. The OTP
  ceiling and one-stream rule are unchanged. The admin Users table shows a
  "Review account" chip.

## Acceptance check

- [x] `tests/test_review_account.py` (7 tests): creates the user; a second run changes
  nothing; `--vet` enrols free + vet_free + baytarian and skips general; `--no-vet` the
  opposite; never admin; three suspicious events block a normal student but not the
  review account (that test fails with the exemption removed).
- [x] Backend suite 386 passed; admin suite 115 passed. Migration `a4e7c2d9b1f3` upgrades,
  downgrades and upgrades again on SQLite.
- [ ] Live: `flask db upgrade`, then the command below on production, then sign in on the
  app with the account and play a paid lesson.

## Production

```bash
cd /development/projects/baytara/backend
FLASK_APP=wsgi.py .venv/bin/flask db upgrade
FLASK_APP=wsgi.py .venv/bin/flask create-review-account review@baytara.app "Baytara Review" +201000000000
FLASK_APP=wsgi.py .venv/bin/flask create-review-account review@baytara.app "Baytara Review" +201000000000 --apply
```

The first run prints what would change. The second asks for the password twice and writes.
Give the store the email and that password. Re-run with `--apply` after new courses are
published to open them too; it asks for the password again and sets it to what you type.
