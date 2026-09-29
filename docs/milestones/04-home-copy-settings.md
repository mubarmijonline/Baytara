# 04 — Home copy in the CMS

**Status:** done

## Goal

Every string on the new home page comes from either the settings CMS (content) or the frontend
`DICT` (chrome). Nothing marketing-facing is hardcoded in JSX.

## What landed

`SITE_SETTING_DEFAULTS` in `backend/app/site_settings.py` gained, all bilingual via `_text`:

| Key | Why |
| --- | --- |
| `hero.trust` — list of `{label}` | the ★4.8 / +2 مليون / شهادات chips have no other source |
| `home.paths_title`, `home.paths_subtitle` | the new section |
| `home.categories_title`, `home.categories_subtitle` | title retitled to «تصفّح حسب التخصّص» |
| `home.instructors_title`, `home.instructors_subtitle` | the design adds a centred heading pair |
| `home.cta_title`, `home.cta_subtitle` | the closing CTA was hardcoded |
| `footer.privacy_url`, `footer.terms_url` | plain strings; links hide when empty |
| `business.stats` | seeded with the design's four tiles (previously `[]`, so the banner was bare) |

`VALIDATION_SCHEMAS` is a `deepcopy` of the defaults, so these validate without a schema edit.

Admin: matching fields in `frontend/admin/src/pages/Settings.jsx` (a `ListEditor` for the trust
chips, plain URL inputs for the legal links) and labels in `site-settings-copy.js`.

Web: mirrored into `FALLBACK_SETTINGS` in `frontend/web/src/lib/site-settings.jsx`, and roughly
forty new `DICT` entries in `frontend/web/src/lib/i18n.jsx` (AR + EN).

## Decisions

- **`t()` now interpolates.** `t('home.lessonOf', { n: 6, total: 15 })` substitutes into `{name}`
  placeholders so "الدرس 6 من 15" stays one translatable sentence instead of three fragments.
  `translate` moved to module scope so `useI18n`'s context-free fallback can use it too.
- Nav labels, level pills and section action links are chrome, so they went to `DICT`, not settings.

## Acceptance check

```bash
cd /development/projects/baytara/backend && .venv/bin/python -m pytest tests/test_site_settings.py -q
```

The new defaults must still pass validation. Then check the admin settings Home and Footer tabs
render the new fields and the live preview picks them up.
