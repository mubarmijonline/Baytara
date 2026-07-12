import re
import uuid


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
