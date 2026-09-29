"""How often a learner may free a device slot themselves.

Two devices is the cap; this is about changing which two. The client's rule, 2026-09-19:
one self-service swap per subscription window, then an admin has to agree. Someone who
buys a new phone is covered without asking anyone; someone cycling a third, fourth and
fifth machine through the account is not.

The window is a fixed number of days rather than a per-course subscription period. A
learner can hold several enrolments with different lengths, and "which course was this
swap against?" has no answer a learner would recognise. `device_swap_days` in Settings
sets it; the default matches the 5-6 month access the client described.
"""
from datetime import datetime, timedelta, timezone

from ..extensions import db
from ..models import Setting

DEFAULT_WINDOW_DAYS = 180
SELF_SERVICE_SWAPS = 1


def window_days():
    setting = db.session.get(Setting, "device_swap_days")
    try:
        value = int(str(setting.value).strip()) if setting and setting.value else DEFAULT_WINDOW_DAYS
    except (TypeError, ValueError):
        return DEFAULT_WINDOW_DAYS
    return value if value > 0 else DEFAULT_WINDOW_DAYS


def _window_open(user, now):
    start = user.device_swap_window_start
    if start is None:
        return False
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return now - start < timedelta(days=window_days())


def allowance(user, now=None):
    """(used, allowed, resets_at) for the current window.

    The window starts at the first swap, not at sign-up: a learner who never swaps never
    burns one, and the clock does not run out before they need it.
    """
    now = now or datetime.now(timezone.utc)
    if not _window_open(user, now):
        return 0, SELF_SERVICE_SWAPS + (user.device_swap_grants or 0), None
    start = user.device_swap_window_start
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return (user.device_swaps_used or 0,
            SELF_SERVICE_SWAPS + (user.device_swap_grants or 0),
            start + timedelta(days=window_days()))


def may_swap(user, now=None):
    used, allowed, _ = allowance(user, now)
    return used < allowed


def record_swap(user, now=None):
    """Count one swap, opening a fresh window if the last one has run out."""
    now = now or datetime.now(timezone.utc)
    if not _window_open(user, now):
        user.device_swap_window_start = now
        user.device_swaps_used = 0
        # Grants are consumed with the window they were given for; an unused approval does
        # not accumulate into a stockpile.
        user.device_swap_grants = 0
    user.device_swaps_used = (user.device_swaps_used or 0) + 1
    db.session.add(user)


def grant_extra(user):
    """An admin approved a request: one more swap inside the current window."""
    user.device_swap_grants = (user.device_swap_grants or 0) + 1
    db.session.add(user)
