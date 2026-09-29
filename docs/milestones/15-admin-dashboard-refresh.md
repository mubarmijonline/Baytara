# 15 — Admin portal: navigation and dashboard refresh

**Status:** in progress.

## Goal

Make the admin portal usable by the people who actually run Baytara day to day — the
person who clears the payment queue in the morning, the one who uploads a lecture, the
one who answers a message — without removing or renaming a single existing capability.

Two screens carry almost all of that traffic and neither was designed for it:

- **The sidebar** is a flat run of seventeen destinations in no order but the one they
  were added in. `المسارات` (learning paths) has working routes but no entry at all, so
  the only way in is one tile on the dashboard.
- **The dashboard** is thirty tiles of identical weight in five groups. A queue with
  eight payments waiting looks exactly like a count of categories. On the normal day,
  when the queues are clear, five of the tiles read `0` and take the top of the screen.

## Acceptance check

1. Every destination, link target, badge and figure that existed before still exists,
   with the same URL and the same filter, in Arabic and in English.
2. `npm test` in `frontend/admin` is green, and `npm run build` succeeds.
3. From the dashboard an admin can see, without scrolling, whether anything is waiting
   on them, and reach it in one click.
4. Every destination is reachable from the sidebar, `المسارات` included.
5. The portal is usable at phone width: the sidebar is a drawer, not seventeen wrapped
   chips.

## Out of scope

- `pages/Accounts.jsx` (InstaPay receiving accounts) has no route and no import anywhere
  in the app; it is dead code today. Wiring it in is a feature decision, not a refresh,
  and is left alone deliberately.
- No backend change. The dashboard draws only what `/admin/stats` and `/admin/storage`
  already return.
