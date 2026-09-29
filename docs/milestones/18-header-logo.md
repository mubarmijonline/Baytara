# 18 — The wordmark, given room

**Status:** done. Website build and 99 tests green, checked on rendered screenshots at
1440, 1000 and 390 px.

## Goal

A client request, 2026-09-22: make the platform logo bigger on laptop and phone, and clear
the area around it so it draws the eye instead of sitting in a crowd — but a moderate
increase, not an overblown one.

## What changed

| | before | after |
| --- | --- | --- |
| wordmark, laptop (>1100px) | 44px | 56px |
| wordmark, narrow laptop | 44px | 48px |
| wordmark, phone | 32px | 40px |
| header bar | 74 / 54px | 86 / 78 / 64px |

Plus 26px of clear air after the wordmark on top of the row's own 20px gap, so the menu
starts somewhere rather than butting against the mark.

The middle size exists because the six nav items and the right-hand cluster run out of room
before the logo does. The wordmark is 1774x598, so it is about three times as wide as it is
tall and **every pixel of height costs three of width** — the full 56px at 901px viewport
would have pushed the menu off its own bar. A laptop gets the large size, a narrow one the
middle size, and below 900px the nav is hidden anyway.

The utility strip above the header now keeps its content on the far side, so the corner
directly above the wordmark is empty. The welcome line used to share the logo's edge one
row above it, which was the crowding the request was actually about.

## The part worth remembering

The header's height was written as a literal `74px` in the JSX and as `54px`, `60px` and
`148px` in four CSS rules that hang off it — the sticky profile tab strip, the phone
notification sheet and its max-height. Growing the bar by hand meant finding all of them,
and missing one would have put the tab strip underneath the header on a page nobody
happened to open.

Both sizes are now `--site-header-h` and `--site-logo-h` on `:root`, overridden per
breakpoint, and every dependent rule reads the variable. Changing the logo size again is
one number.

## Acceptance

- [x] Rendered at 1440, 1000 and 390px: logo measures 56, 48 and 40px, nothing overflows,
      and the corner above the wordmark is clear.
- [x] `npm run build` and 99 tests pass.
- [ ] Client's eye on it. "Moderate, not over" is their judgement to make, and the sizes
      are one variable each if they want more or less.
