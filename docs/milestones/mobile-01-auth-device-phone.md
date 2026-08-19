# mobile-01 — Auth, device binding and the phone gate

**Status:** done (device testing pending — needs two physical Android phones)

## Goal

Sign in three ways, bind the install to a device slot, and make the phone gate genuinely
impassable. This is the milestone that decides whether video can ever play: every later
refusal from `POST /video/playback` is downstream of getting identity right here.

## Decisions taken before building

- **The device id is excluded from Android backup.** See below — this is the one decision
  in this milestone with a real trade-off.
- **Google sign-in uses `google_sign_in` 7.2.0**, whose API is instance-based
  (`GoogleSignIn.instance.initialize()` then `.authenticate()`). The server wants the
  **ID token**, off `account.authentication.idToken`, as `credential`.
- **The Google button is hidden, not disabled, when `/auth/google-config` returns an empty
  `client_id`.** A button that cannot work is worse than no button.

## What was built

```
lib/core/validation/phone.dart              ported from backend/app/services/phone.py
lib/features/auth/
  data/auth_dto.dart                        wire shapes, exactly as _user_json sends them
  data/auth_repository.dart                 register, login, google, me, phone, devices, logout
  application/auth_controller.dart          bootstrap + the flows; owns SessionState
  ui/sign_in_screen.dart                    tabbed sign in / create account + Google
  ui/phone_field.dart                       country picker + national number
  ui/phone_gate_screen.dart                 the mandatory gate
  ui/devices_screen.dart                    serves both the limit refusal and account use
lib/router/splash_screen.dart               runs bootstrap, then the guard decides
```

## The Android backup decision, and why it goes this way

`flutter_secure_storage` keeps its values in a shared-prefs file named
`FlutterSecureStorage.xml`. Android auto-backup would restore that file — including the
device id — onto a **new** handset.

That is the wrong outcome, and not marginally so: one device id covering two physical
phones means the server counts them as one, and a user could restore the same backup onto
any number of handsets. The two-device limit would stop meaning anything.

So both `backup_rules.xml` (Android 11 and below) and `data_extraction_rules.xml`
(Android 12+, covering cloud backup *and* direct device transfer) exclude that file.

The cost is real and accepted: reinstalling on the **same** phone generates a fresh device
id and consumes one of the account's two slots. That is recoverable — the devices screen
removes the stale entry — whereas a bypassed device limit is not.

## Details that are easy to get wrong

- **`device_id` goes in the JSON body** on register/login/google/logout, and in the
  `X-Baytara-Device-ID` header everywhere else. The server cross-checks them and puts the
  body value into the JWT as a claim. A test asserts the two carry the same value.
- **Tokens are stored before the auth call returns.** A caller that navigates on the
  returned value must not be able to reach an authed screen while the tokens are unwritten.
- **`logout` clears tokens even when the server call fails.** A user who pressed sign out
  is signed out; leaving them in because the network dropped is worse than leaving a stale
  device row behind. The device id deliberately survives — it identifies the install, not
  the session.
- **`403 device_limit_reached` already carries `devices[]` and `max_devices`**, so the
  screen is seeded from the refusal rather than making a second call. That route is the one
  authed-looking screen a signed-out user may see, and the router allows it explicitly.
- **`403 device_not_registered` on refresh** means the device was removed from another
  session. The sign-in screen now says so, rather than ejecting the user with no
  explanation.

## Phone validation is verified against the backend, not against assumptions

`lib/core/validation/phone.dart` is a port of `backend/app/services/phone.py`. Rather than
trust the port, the 20 inputs in `test/phone_validation_test.dart` were run through the
**actual Python module** and the outputs compared: all 20 agree, including the awkward ones
(`00201024527770`, a trunk zero kept after the country code, a Cairo landline, and the bare
`01` that used to pass).

This matters more than ordinary form validation. The number is burnt into the video
watermark, so a wrong one weakens content protection as much as a missing one.

## Tests

`flutter test` — **43 passing** (22 from mobile-00, 21 new), `flutter analyze` clean.

| File | Covers |
|---|---|
| `phone_validation_test.dart` | parity with the Python normaliser across all seven countries; every picker placeholder is itself a valid number |
| `auth_flow_test.dart` | device id in body *and* header and identical; `BaytaraApp/` marker on every request; `lang` on GETs; device-limit → typed exception with the list; `needs_phone`; field errors; logout clears tokens but keeps the device id |

## Acceptance check

```bash
cd mobile_app && flutter test && flutter analyze && flutter build apk --debug
```

## Still to verify on hardware

These cannot be checked on a headless server and are the reason this milestone is not
closed for device testing:

- [ ] Sign in on a third device produces the device screen; removing one lets it in.
      **Needs two physical phones plus this one.**
- [ ] Google sign-in end to end — needs the release SHA-1 registered in the Google console
      for the `app.baytara.app` package, which is a console change, not code.
- [ ] A Google account with no phone cannot reach any player route. The guard is unit
      tested; the real path needs a real Google account.

## Open item carried forward

**There is still no password-reset endpoint.** A user who forgets their password has no
route back to their account. This is backend work and out of scope for the client, but it
will be the first support request after launch.
