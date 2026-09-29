# mobile-07 — Account, notifications, and the deferred catalogue screens

**Status:** done

## Goal

Finish the app's surface: notifications, profile, settings, and the four screens deferred
from milestone 2. **No placeholder screens remain** — every tab and every route now renders
something real.

## Notifications are a poll, and that is a product limitation

**There is no push infrastructure.** No FCM, no APNs, nothing server-side that could send
one. Adding it is a backend change that has to be agreed separately, so the app polls every
60 seconds, exactly as the website's header bell does
(`frontend/web/src/layouts/Header.jsx`, also 60s).

The consequence is worth stating plainly rather than hiding: **a verification result or a
payment confirmation reaches the user only while the app is open.** For a flow whose own copy
says "the answer will arrive in your notifications" (milestone 6's 202 screen), that is a
real gap, and it is a backend decision, not something the client can fix.

Two things make the poll behave:

- **It stops when the app is backgrounded** and resumes on return. A timer firing every 60
  seconds behind a locked screen spends battery and mobile data to learn something nobody
  can see.
- **It stops when signed out.** The endpoint 401s for an anonymous caller, so polling would
  be a refresh attempt every minute for nothing.

Reads are optimistic: the badge and the row react immediately and the server call reconciles
after, which is what the website does. A failed call reloads rather than leaving a lie on
screen, and a failed *poll* keeps whatever is already displayed instead of blanking it.

## Profile shows what the server will actually accept

`EDITABLE_PROFILE_FIELDS` in `backend/app/api/v1/auth.py` is exactly
`{name, headline, location, bio}`. Role, email and verification status are deliberately
absent server-side.

So email and phone are rendered **read-only** rather than offered as fields that silently
ignore input. A form that accepts a change the server discards is worse than one that never
offered it.

## The deferred catalogue screens

Bundles, instructors, articles and the blog were deferred from milestone 2 so the player had
room. They are plain lists over endpoints already wired, and they carry none of the access
subtlety that made the courses list worth building first. The Content tab, which had rendered
a placeholder since milestone 0, is now the free-content shelf.

Blog posts and free content are **one table** server-side (`ARTICLE_TYPES = blog | content`),
so one screen serves both with a `kind` parameter rather than two near-identical files.

## Settings links out rather than reimplementing

Privacy, about and contact open `baytara.app` in the browser. The stores require a reachable
privacy policy; a native copy would be one more thing to keep in step with the real one, and
it would drift.

Sign-out goes through `POST /auth/logout` with the device id, which **frees the device slot
server-side**. That is the difference between signing out and merely dropping the tokens: the
latter leaves the account one device down until someone notices.

## What was built

```
lib/features/account/
  data/notifications_repository.dart
  application/notifications_controller.dart   lifecycle-aware polling, optimistic reads
  ui/notifications_screen.dart                list + the unread bell widget
  ui/settings_screen.dart                     language, account links, legal, sign out
  ui/profile_screen.dart                      editable name; email and phone read-only
lib/features/catalogue/ui/
  content_screen.dart                         articles + blog + article detail
  bundles_screen.dart                         bundles + instructors
```

## Tests

`flutter test` — **165 passing** (159 from mobile-00..06, 6 new), `flutter analyze` clean.

`notifications_test.dart` covers: a missing `is_read` reading as unread (defaulting to read
would hide something unseen); a body-less notification staying valid; an unparseable date not
losing the row; `asRead` flipping only the read flag; the 60s interval matching the website.

## Acceptance check

```bash
cd mobile_app && flutter test && flutter analyze && flutter build apk --debug
```

## Still to verify on hardware

- [ ] The poll genuinely stops on background (check with battery/network stats, not by
      reading the code).
- [ ] RTL layout of the settings list, the notification rows and the unread badge.
- [ ] The unread badge count matching the server after marking items read on the website.

## Open items carried forward, none of them client-side

- **No push infrastructure.** Notifications are invisible unless the app is open.
- **No password reset endpoint.** A user who forgets their password has no route back.
- **No account deletion endpoint.** App Store review will ask for one.
