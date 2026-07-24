# Baytara — Contract Gap Closure Tracker

Source: signed contract (البنود 1-3). Payment stays **InstaPay OCR + admin approval**
(Paymob/Fawry explicitly skipped per client). This file tracks the remaining
contract features not yet built.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

Decisions (client-confirmed):
- Access Duration: **lifetime unless set** (per-course nullable validity)
- Renewal fee: **global %** (admin-controlled setting)
- Device Limit: **block the 3rd device** (max 2 per account)
- Bilingual: **UI + content fields** (dual AR/EN, AR is base + fallback)

## Features

- [x] **G1 · Dynamic watermark → add phone** (البند2). User.phone + register + `watermark_for`;
      phone field on web signup. DONE + deployed.
- [x] **G2 · Access Duration** (البند3). Course.access_days (null=lifetime), Enrollment.expires_at,
      set on enroll/approve, enforced on video playback + progress; dashboard expiry badges;
      admin access_days field. DONE + deployed.
- [x] **G3 · Renewal** (البند3). Global `renewal_percent` setting (admin Settings); InstaPay
      kind=renewal extends expires_at; dashboard renew button; /payment/quote for pricing. DONE.
- [x] **G4 · Course Bundling** (البند3). Bundle model + M2M, public /bundles page, admin CRUD page,
      InstaPay kind=bundle enrolls all member courses. DONE + deployed.
- [x] **G5 · Device Limit — 2 devices** (البند2). UserDevice table, device_id from client,
      blocks 3rd on login, dashboard device list + remove. DONE + deployed.
- [~] **G6 · Full bilingual AR/EN** (البند1). Backend: dual `_en` columns + localized to_dict via
      ?lang (DONE). Admin authoring: EN inputs on course/module/lesson/category/article (DONE).
      Web: i18n layer + language toggle + API content localizes (DONE). REMAINING: some hardcoded
      Arabic chrome strings in web pages (Home/Courses/Pricing/etc.) still need t() extraction;
      instructor portal UI not yet localized.

## Explicitly out of scope
- Paymob / Fawry / e-wallet gateways — replaced by InstaPay (client decision).

## Notes
- Test suite (`tests/test_*.py`) runs against the LIVE DB (DATABASE_URL). It should use a
  separate test database — running it pollutes production data (cleaned up manually after this build).
