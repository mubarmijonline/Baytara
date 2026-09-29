"""Discount codes: the one place a code is turned into money off.

The rule that shapes this file: **the discount is computed here and nowhere else.** The
browser sends a code, never an amount. A client that could name its own discount is a
client that could buy a course for nothing, and "the field is disabled in the UI" is not a
control.

Usage is counted from payments that reached `paid`. A code is spent when money changes
hands, not when someone opens a checkout and wanders off, and a refunded payment still
counts as used because the code did its job.
"""
from datetime import datetime, timezone

from ..extensions import db
from ..models import Payment, PromoCode


def normalize(code):
    return (code or "").strip().upper()[:40]


def _now():
    return datetime.now(timezone.utc)


def _aware(value):
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def uses(promo, user_id=None):
    """How many successful payments have used this code, in total or by one buyer."""
    q = Payment.query.filter(Payment.promo_code_id == promo.id, Payment.status == "paid")
    if user_id is not None:
        q = q.filter(Payment.user_id == user_id)
    return q.count()


def lookup(code):
    value = normalize(code)
    if not value:
        return None
    return PromoCode.query.filter_by(code=value).first()


def validate(code, user_id, amount):
    """`(promo, discount, error)` — exactly one of promo/error is set.

    Every refusal has its own code so the checkout can say what is actually wrong. "Invalid
    code" in front of someone holding a code that merely expired yesterday is the kind of
    message that produces a support ticket instead of a sale.
    """
    promo = lookup(code)
    if not promo:
        return None, None, "promo_not_found"
    if not promo.is_active:
        return None, None, "promo_inactive"

    now = _now()
    starts = _aware(promo.starts_at)
    expires = _aware(promo.expires_at)
    if starts and now < starts:
        return None, None, "promo_not_started"
    if expires and now >= expires:
        return None, None, "promo_expired"

    if promo.max_uses is not None and uses(promo) >= promo.max_uses:
        return None, None, "promo_exhausted"
    if promo.per_user_limit and uses(promo, user_id) >= promo.per_user_limit:
        return None, None, "promo_already_used"

    discount = promo.discount_for(amount)
    if discount <= 0:
        # A code that takes nothing off is not a working code, and letting it through
        # would show the buyer a "discount applied" line worth zero.
        return None, None, "promo_no_effect"
    return promo, discount, None


def apply(code, user_id, amount):
    """`(promo, discount, final_amount, error)` with the charge already worked out."""
    promo, discount, error = validate(code, user_id, amount)
    if error:
        return None, None, amount, error
    return promo, discount, float(round(float(amount) - float(discount), 2)), None
