import re
import uuid

from flask import request


def req_lang():
    """Locale for the current request: ?lang=ar|en, else Accept-Language, default 'ar'
    (contract البند1: Arabic default)."""
    lang = (request.args.get("lang") or "").lower()
    if lang in ("ar", "en"):
        return lang
    return "en" if (request.headers.get("Accept-Language") or "").lower().startswith("en") else "ar"


def renewal_percent():
    """Global renewal fee as a percent of course price (admin-set, default 30%)."""
    from .models import Setting
    from .extensions import db
    s = db.session.get(Setting, "renewal_percent")
    try:
        v = float(s.value) if s and s.value is not None else 30.0
    except (TypeError, ValueError):
        v = 30.0
    return max(0.0, v)


def slugify(text, existing_check=None):
    """Slug from a title (keeps Arabic + word chars). Ensures uniqueness via existing_check(slug)->bool."""
    s = (text or "").strip().lower()
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"[^؀-ۿ\w-]", "", s)  # keep Arabic block + word chars + hyphen
    s = re.sub(r"-+", "-", s).strip("-")
    if not s:
        s = f"item-{uuid.uuid4().hex[:8]}"
    if existing_check is None:
        return s
    base, i = s, 2
    while existing_check(s):
        s = f"{base}-{i}"
        i += 1
    return s
