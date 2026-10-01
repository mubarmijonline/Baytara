"""An admin opening a course to chosen people without payment.

The client's use (voice note, 2026-10-01): influencers, reviewers and people they know get
a course free so they can watch and review it, and so a new course does not advertise zero
learners. A grant is an ordinary enrolment with `source = "admin_grant"` and no payment
row, so the player, the review gate, the learner count and the certificate all treat it
exactly as a bought seat. Revenue is untouched because no payment exists.

A person the course's audience rule would refuse anyway (a baytarian course for an
unverified account, a general course for a vet) is skipped with the reason rather than
given a seat the player will not honour. The admin verifies them first.
"""
from ..extensions import db
from ..models import Enrollment, User, push_notification
from .catalog_access import audience_error

MAX_PER_CALL = 200
ACCESS_CHOICES = ("course", "lifetime")
SOURCE = "admin_grant"


def grant_course(course, user_ids, access="course"):
    """Grant `course` to each id in `user_ids`. Returns (granted, skipped) as lists of
    dicts; the caller commits."""
    access_days = None if access == "lifetime" else course.access_days
    granted, skipped = [], []
    seen = set()
    for raw in user_ids:
        uid = int(raw)
        if uid in seen:
            continue
        seen.add(uid)
        user = db.session.get(User, uid)
        if not user or not user.is_active or user.deleted_at is not None:
            skipped.append({"user_id": uid, "reason": "user_unavailable"})
            continue
        reason = audience_error(user, course.access_type)
        if reason:
            skipped.append(_who(user, reason))
            continue

        enrollment = Enrollment.query.filter_by(user_id=uid, course_id=course.id).first()
        if enrollment and enrollment.has_access():
            skipped.append(_who(user, "already_enrolled"))
            continue
        if enrollment:
            # A cancelled seat comes back onto the counter, which cancelling took it off;
            # a lapsed one is already counted and only gets a fresh window.
            if enrollment.status != "active":
                course.enrolled_count = (course.enrolled_count or 0) + 1
                enrollment.cancelled_at = enrollment.cancel_reason = enrollment.cancelled_by = None
            enrollment.status = "active"
            enrollment.source = SOURCE
            enrollment.expires_at = Enrollment.compute_expiry(access_days)
        else:
            db.session.add(Enrollment(user_id=uid, course_id=course.id, source=SOURCE,
                                      status="active",
                                      expires_at=Enrollment.compute_expiry(access_days)))
            course.enrolled_count = (course.enrolled_count or 0) + 1
        push_notification(uid, "enrollment", "تم فتح دورة لك",
                          f"أصبحت دورة «{course.title}» متاحة لك مجاناً. مشاهدة ممتعة!")
        granted.append(_who(user))
    return granted, skipped


def _who(user, reason=None):
    row = {"user_id": user.id, "name": user.name, "email": user.email}
    if reason:
        row["reason"] = reason
    return row
