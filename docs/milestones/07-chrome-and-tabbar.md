# 07 — Header, footer and the mobile tab bar

**Status:** done

## Goal

Bring the shared chrome to the design. It is used by all 25 routes, so this settles the frame for
the rest of the redesign.

## What landed

**`layouts/Header.jsx`** — the bar is now dark (`colors.utilityBar`) at 74px with
`/brand/logo-white.png`. One `NAV` array drives both the desktop bar and the mobile drawer; they
had drifted, and the desktop bar was silently missing `/videos`. Seven items: المسارات، الدورات،
الفيديوهات، الاستشارات، المدوّنة، الأسعار، للأعمال, with a 2px gold underline on the active one.
The dead full-width search input became a 38px icon button that goes to `/courses` — the only
listing wired to `webapi.courses({ q })`. «دخول» goes to `/auth`; the gold «اشترك الآن» to
`/pricing`. Every hardcoded Arabic literal in this file now goes through `t()`.

**`layouts/Footer.jsx`** — the three columns came from `mock.js` and rendered as `<span>`s with no
handler and no href. They are now `<Link>`s to real routes. The privacy and terms links render
only when `footer.privacy_url` / `footer.terms_url` are set; the third dead legal link is gone.

**`components/TabBar.jsx`** — phone-only bottom navigation: الرئيسية / المسارات / الاستشارات /
لوحتي, active item in the brand blue. Rendered once by `Layout.jsx`.

## Decisions

- **One mobile threshold.** `.site-tabbar` is `display:none` by default and `display:grid` inside
  the *existing* `@media (max-width: 760px)` block — the same breakpoint that already hides the
  utility bar. The footer gets matching bottom padding in the same rule.
- **The tab bar hides on the player.** `if (pathname.startsWith('/learn/')) return null;` so it
  never sits over the video.
- **«الاستشارات» maps to the existing `/content`.** No consultations backend was in scope; every
  nav and footer entry points at a route that exists.
- The burger drawer stays. It is what makes a seven-item nav survive a phone.

## Acceptance check

```bash
cd /development/projects/baytara/frontend/web && npm run test
```

Then at 390px: the tab bar appears, the utility bar hides, and the footer clears the bar. Click
every footer link and confirm none 404s.
