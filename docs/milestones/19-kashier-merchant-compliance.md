# 19 — What Kashier checks before they switch us on

**Status:** done and live. Shipped with commit 507c836 (2026-09-24): `/terms` and
`/delivery` are routed and linked from the footer on baytara.app (checked 2026-10-01).
**Still open:** both pages are legal text drafted here rather than written by the client,
and no written sign-off from the client on that text is recorded. Get one.

## Goal

Work through Kashier's merchant compliance checklist against the live site and close what
is missing, so the account can be activated for production credentials.

## What was already there

The backend integration is done and is the strongest part of this: `create_session`,
`read_payment`, and a webhook verified with HMAC-SHA256 over the exact field set Kashier
names in `signatureKeys`, compared with `hmac.compare_digest`. Enrolment is activated by
the server-confirmed webhook, never by the browser coming back from the gateway — which is
the distinction a gateway's risk team actually cares about.

The refund and cancellation policy was already written, in the client's own Arabic, and
already names Kashier, the 7-day window, the 20% watched limit and the 5-14 day bank
timeline. The privacy policy already stated that card numbers are neither received nor
stored.

## What was missing, and is now there

**Terms and conditions had no page and, worse, no link.** The footer built its legal row
from `settings.footer.terms_url` with no fallback, unlike privacy and refund which fall
back to built-in routes. That key is empty in the live CMS, so the filter dropped the entry
and the site published **no terms link at all**. A reviewer opening the footer would have
found two of the four documents they look for. `/terms` now exists and all four links fall
back to real routes, so none of them depends on an admin having remembered to paste a URL.

**Digital delivery and access** is its own item on Kashier's list and had nothing.
`/delivery` now answers the question a gateway asks about digital goods: what exactly does
the buyer receive, and when. It says activation follows the gateway's confirmation rather
than the browser's return, because that is what the code does.

**Accepted payment methods** appeared nowhere — not in the footer, not at checkout. Both
now carry a badge row plus a line stating that payment is taken on Kashier's secure page
and that card details are never received or stored.

## Two things that are not code, and cannot be invented here

1. **Support phone and office address are empty in the CMS.** Kashier's checklist requires
   a working support number and a physical address or operating country. The email
   (`hello@baytara.app`) is set. These go in the admin under Settings → Contact; they are
   business facts, so they are the client's to supply and nobody else's to make up.
2. **The payment badges are typeset wordmarks, not the official artwork.** The real
   Visa/Mastercard/Meeza/Kashier files are not in this repo, and approximating a trademark
   is worse than setting the name plainly. `PaymentBadges.jsx` takes a `src` per entry;
   drop the merchant kit into `public/brand/pay/` and they become images with no other
   change.

## A note on the two new documents

`Refund.jsx` carries a comment that its Arabic is the client's own wording and must not be
"improved" without being asked. `Terms.jsx` and `Delivery.jsx` are the opposite: drafted
here to satisfy the checklist, describing the platform as it actually behaves — two
devices, capture protection, verification gating vet-only content, EGP pricing with no
added fees. Every rule they state is one the code already enforces. They should still be
read by the client, and ideally by a lawyer, before being relied on. Both files say so at
the top.

## Checklist

| Kashier requirement | Before | Now |
| --- | --- | --- |
| Terms & conditions, linked in footer | missing entirely | `/terms`, linked |
| Privacy policy | present | present, gateway named |
| Refund / cancellation | present, client's wording | unchanged |
| Digital delivery & access | missing | `/delivery`, linked |
| Contact: email | set | set |
| Contact: phone | **empty** | **client to supply** |
| Contact: address / country | **empty** | **client to supply** |
| About us | present | present |
| Prices in EGP, no hidden fees | present | stated in terms as well |
| Payment method badges, footer | missing | present |
| Payment method badges, checkout | missing | present |
| HTTPS on checkout routes | enforced | unchanged |
| Checkout initiation | present | unchanged |
| Return / redirect handler | present | unchanged |
| Webhook HMAC verification | present | unchanged |
