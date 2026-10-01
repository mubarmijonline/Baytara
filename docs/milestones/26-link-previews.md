# 26: Link previews for articles and book summaries

**Status:** live, 2026-10-01. The backend restart at 16:27:43 loaded the route (the other
session's migrations went in about a minute later). Verified live with a crawler user agent: the
published article returns its own title, summary, cover and encoded `og:url`; the cover
serves as `image/jpeg`; an unknown slug still answers 200. Still open: check 6 (Facebook
debugger and a real WhatsApp share), and `/library/<slug>` on a real book, since none is
published yet.

## Goal

A link to an article (`/blog/<slug>`) or a book summary (`/library/<slug>`) pasted into
WhatsApp, Facebook, Telegram or X shows that article's or book's own title, summary and
cover. Every other page shows one branded Baytara card instead of a bare URL.

## Why it was not working

The site is a single page app: every URL answers with the same `index.html`, and the page
fills in its content with JavaScript. Link-preview crawlers do not run JavaScript, so they
saw only the shell, which had no Open Graph tags at all.

## Acceptance check

1. `curl -A facebookexternalhit/1.1 https://baytara.app/blog/<published slug>` returns HTML
   whose `og:title`, `og:description`, `og:image` and `og:url` describe that article; the
   same for `/library/<published slug>`.
2. An unknown or draft slug answers 200 with the default card (the page itself shows its
   own not-found, as before).
3. `/`, `/courses`, `/library` carry the default card.
4. The pages still open and work in a browser exactly as before, including for a signed-in
   user; the app links (`/.well-known/...`) are untouched.
5. With the API stopped, `/blog/<slug>` still serves the site (nginx falls back to the
   static shell).
6. Facebook's sharing debugger and a real WhatsApp share show the article's card.

## How it was rolled out

nginx falls back to the static shell on 404 as well as 5xx. That made it safe to install
the config before gunicorn had the route: until the restart, Flask answers 404 for these
paths and visitors get exactly the page they got before. Verified live: `/`, `/courses`,
`/library`, an Arabic article slug and an unknown slug all return 200 with `no-store` and
the security headers, and `/brand/og-default.png` serves as `image/png`.
