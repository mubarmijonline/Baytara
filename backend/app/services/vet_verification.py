"""Verifying an account as a veterinarian with no document at all: someone vouches for it.

Shared by the admin's direct verify (POST /admin/users/<uid>/verify) and
`flask create-review-account`. Recorded as an approved request on the `admin` route rather
than a quiet flag on the user, so the verification queue shows who was verified this way,
by whom, and revoke works on it exactly like any other approval.
"""
from datetime import datetime, timezone

from ..extensions import db
from ..models import BaytarianRequest, push_notification

GRANTS = ("baytarian", "vet_student")


def verify_directly(user, grant="baytarian", reviewer_id=None, note=None):
    """Verify `user` and record the approval. Returns the request; the caller commits."""
    r = BaytarianRequest(user_id=user.id, status="approved", route="admin", grant=grant,
                         note=note or None, reviewed_by=reviewer_id,
                         reviewed_at=datetime.now(timezone.utc))
    db.session.add(r)
    user.is_baytarian = True
    user.is_vet_student = grant == "vet_student"
    push_notification(
        user.id, "baytarian_approved",
        "تم توثيقك كطالب طب بيطري ✅" if grant == "vet_student"
        else "تم توثيق حسابك كطبيب بيطري ✅",
        "وثّقت الإدارة حسابك. أصبح بإمكانك الوصول إلى المحتوى المخصّص للأطباء.")
    return r
