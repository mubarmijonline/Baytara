from decimal import Decimal, InvalidOperation


ACCESS_TYPES = ("free", "vet_free", "baytarian", "general")
FREE_ACCESS = {"free", "vet_free"}
PAID_ACCESS = {"baytarian", "general"}
SUPPORTED_CURRENCIES = {"EGP"}
PUBLISHED_STATUS = "published"


class CatalogValidationError(ValueError):
    def __init__(self, errors):
        self.errors = tuple(errors)
        super().__init__(", ".join(self.errors))


def access_is_paid(access_type):
    return access_type in PAID_ACCESS


def audience_error(user, access_type):
    if getattr(user, "role", None) == "admin":
        return None

    is_vet = bool(getattr(user, "is_baytarian", False))
    if access_type in {"vet_free", "baytarian"} and not is_vet:
        return "needs_baytarian"
    if access_type == "general" and is_vet:
        return "non_veterinarians_only"
    return None


def validate_catalog_item(data, current=None):
    """Validate and normalize the shared commerce fields for a course or video."""
    current = current or {}
    if not isinstance(current, dict):
        current = {
            key: getattr(current, key, None)
            for key in ("access_type", "currency", "price", "access_days", "status", "category_id")
        }
    normalized = dict(current)
    normalized.update(data)

    errors = []
    access_type = normalized.get("access_type", "general")
    if access_type not in ACCESS_TYPES:
        errors.append("invalid_access_type")

    currency = normalized.get("currency", "EGP")
    if currency not in SUPPORTED_CURRENCIES:
        errors.append("invalid_currency")

    price = normalized.get("price", 0)
    try:
        price = Decimal(str(price))
    except (InvalidOperation, TypeError, ValueError):
        errors.append("positive_price_required")
    else:
        if access_type in FREE_ACCESS:
            price = Decimal("0")
        elif access_type in PAID_ACCESS and price <= 0:
            errors.append("positive_price_required")

    access_days = normalized.get("access_days")
    if access_days is not None and (isinstance(access_days, bool) or not isinstance(access_days, int) or access_days <= 0):
        errors.append("positive_access_days_required")

    if normalized.get("status", "draft") == PUBLISHED_STATUS and not normalized.get("category_id"):
        errors.append("category_required")

    if errors:
        raise CatalogValidationError(errors)

    normalized["access_type"] = access_type
    normalized["currency"] = currency
    normalized["price"] = price
    normalized["access_days"] = access_days
    return normalized


def video_access(user, video):
    """Return whether a user may play a video without exposing provider credentials."""
    if getattr(user, "role", None) == "admin":
        return True, None

    user_id = getattr(user, "id", None)
    assignments = getattr(video, "course_assignments", ())
    course_ids = [assignment.course_id for assignment in assignments]
    if video.course_id:
        course_ids.append(video.course_id)
    if video.module_id:
        course_id = video.resolve_course_id()
        if course_id:
            course_ids.append(course_id)
    course_ids = set(course_ids)
    if user_id and course_ids:
        from ..models.catalog import Course

        assigned_course = Course.query.filter(
            Course.id.in_(course_ids), Course.instructor_id == user_id
        ).first()
        if assigned_course:
            return True, None

    from ..models.learning import Enrollment, VideoEntitlement

    entitlement = VideoEntitlement.query.filter_by(
        user_id=user_id, video_id=video.id, status="active"
    ).first()
    if entitlement and entitlement.has_access():
        return True, None

    if course_ids:
        enrollments = Enrollment.query.filter(
            Enrollment.user_id == user_id,
            Enrollment.course_id.in_(course_ids),
            Enrollment.status == "active",
        ).all()
        eligible = [
            enrollment for enrollment in enrollments
            if audience_error(user, enrollment.course.access_type) is None
        ]
        if any(enrollment.has_access() for enrollment in eligible):
            return True, None
        if any(enrollment.is_expired() for enrollment in eligible):
            return False, "access_expired"
        return False, "not_entitled"

    reason = audience_error(user, video.access_type)
    if reason:
        return False, reason
    if video.access_type in FREE_ACCESS:
        return True, None

    return False, "not_entitled"
