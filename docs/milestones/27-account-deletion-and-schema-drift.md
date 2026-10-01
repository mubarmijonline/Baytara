# 27 - Account deletion, and the schema drift pass

**Status:** live on the website and the API since 2026-10-01 (API 16:28, website 16:38).
The app screen reaches phones only with the next release.

The deploy ran in the wrong order: the API restarted onto this code about a minute before
the migration ran, and for that minute every endpoint that reads a user answered 500. The
order in PLAN.md (migrate, then restart) is the one to keep.

## Goal

1. A learner can close their own account from the website and from the app, which both
   app stores require before review (App Store Guideline 5.1.1(v); Google Play's account
   deletion requirement, which also asks for a web address that works without the app).
2. Autogenerate stops proposing to drop unique constraints, so a migration can again be
   generated and read instead of hand-written around known noise.

## Account deletion

**Anonymised, not removed.** Payments, enrolments, lesson progress, exam attempts and
playback logs point at the user row and are the platform's accounting and anti-piracy
record. They stay, attached to an account named "حساب محذوف" with the email
`deleted-<id>@deleted.baytara.invalid` (`.invalid` is reserved, so nothing can be mailed
to it by accident).

Removed: name, email, phone, password, Google link, national ID and its photo, vet card
fields and the verification requests with their files on disk, profile and cover photos
(only files this account uploaded), reviews (course ratings recounted), certificates of
both kinds (the public page answers "not found": with no name it would verify nobody),
devices, device-swap requests and notifications.

**Rules.**
- `DELETE /api/v1/auth/account` with `{"confirm": true, "password": ...}`. The password
  is required when the account has one; a Google-only account has none to give, and
  `/auth/me` now says which (`has_password`).
- A wrong password is **403 `wrong_password`, not 401**: both clients treat any 401 as
  "signed out" and would drop the session over a typo.
- Students only. Instructors own courses that cannot exist without them; admins close
  staff accounts from the admin portal, as before (`403 staff_account`).
- The email and the Google account are freed. Signing up again starts a new, empty
  account; nothing from the old one carries over.
- An admin cannot switch a closed account back on (`409 account_deleted`), and the admin
  user list shows `deleted_at`.
- Sessions end at once for refresh; an outstanding access token lives at most its normal
  15 minutes, and every endpoint that checks `is_active` refuses it.

**Where.**
- Website: `/account/delete`, linked from the profile's settings tab and from the privacy
  policy's rights section. This is the URL to give Google Play and App Store Connect.
- App: Settings, "حذف الحساب" (students only), the same copy and rules.

**Migration** `c3d9e1a7f2b4`: adds nullable `users.deleted_at`. Additive, no backfill.

## Schema drift

Read-only comparison of the live database against the models (2026-10-01) found six
differences besides the new column:

| Live database | Models | Resolution |
| --- | --- | --- |
| `certificates_serial_key` UNIQUE constraint **and** unique index `ix_certificates_serial` | unique index only | drop the constraint (`d8f2a4c6e1b9`) |
| `learning_paths_slug_key` + `ix_learning_paths_slug` | unique index only | drop the constraint |
| `video_playback_events_client_event_id_key` + unique index | unique index only | drop the constraint |
| `video_playback_sessions_public_id_key` + unique index | unique index only | drop the constraint |
| composite index `ix_user_devices_user_group (user_id, device_group)` | a single-column index on `device_group` | model corrected to declare the composite index; no database change |

Every column stays unique: the unique index the model declares is still there and refuses a
duplicate. What goes is a second, identical guarantee that only cost writes. The migration
uses `DROP CONSTRAINT IF EXISTS`, runs on Postgres only (SQLite gives these inline
constraints no name, and its unique index holds the line), and its downgrade puts the
constraints back.

After both migrations apply, the comparison should report nothing.

## Acceptance check

- [x] Backend: `tests/test_account_deletion.py` (6 tests); full suite 371 passed, including the
  test that runs every migration on SQLite.
- [x] Website: `src/pages/delete-account.test.jsx` (4 tests); full suite 112 passed; build passes.
- [x] App: four deletion cases in `test/auth_flow_test.dart`; `flutter analyze` clean; 269 tests passed.
- [x] Production: both migrations applied (`d8f2a4c6e1b9` is head), backend restarted.
- [x] Production: website build published; `https://baytara.app/account/delete` renders the
  page in a headless browser, with the sign-in link returning to it for a visitor.
- [x] Live API, throwaway account: wrong password 403 `wrong_password` and the session kept;
  right password 200; the old email and password then 401; the same email registers again
  as a new account (new id). Both throwaway accounts were closed afterwards.
- [x] Live: the schema comparison reports zero differences.
