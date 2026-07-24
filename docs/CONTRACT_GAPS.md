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

- [ ] **G1 · Dynamic watermark → add phone** (contract البند2). User.phone + register + `watermark_for`.
- [ ] **G2 · Access Duration** (البند3). Course.access_days (null=lifetime), Enrollment.expires_at,
      set on enroll/approve, enforce on video playback + learn, show expiry in dashboard.
- [ ] **G3 · Renewal** (البند3). Global `renewal_percent` setting; student renewal → InstaPay
      payment (kind=renewal) → admin approve extends expires_at. Student "extend" button.
- [ ] **G4 · Course Bundling** (البند3). Bundle model + bundle_courses M2M, custom discount price,
      public page, admin CRUD, purchase (InstaPay) → approve enrolls all courses.
- [ ] **G5 · Device Limit — 2 devices** (البند2). UserDevice table, device_id from client on
      login/refresh, block when 2 active + a new one appears; manage/remove devices.
- [ ] **G6 · Full bilingual AR/EN** (البند1). Dual `_en` columns on catalog/content; localized
      to_dict; language toggle + i18n chrome dict in all 3 SPAs; dual inputs in admin.

## Explicitly out of scope
- Paymob / Fawry / e-wallet gateways — replaced by InstaPay (client decision).
