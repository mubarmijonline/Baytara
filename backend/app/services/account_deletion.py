"""A learner closing their own account (App Store 5.1.1(v), Google Play's deletion rule).

The account is anonymised rather than removed. Payments, enrolments, progress and exam
attempts stay, because they are the platform's accounting and an instructor's revenue,
and a refund dispute months later still has to find the payment. What identifies the
person goes: name, email, phone, national ID and its photo, the verification card
images, the profile photos, reviews, certificates, devices and notifications. The
email is freed so the same address can register again as a new account.

Staff accounts are refused here. An instructor's courses cannot exist without them,
and an admin closing their own account is an admin decision, made in the admin portal.
"""
import os
import shutil
from datetime import datetime, timezone

from flask import current_app

from ..extensions import db
from ..models import (
    BaytarianRequest, Certificate, CompletionCertificate, Course, CourseReview,
    DeviceSwapRequest, Notification, User, UserDevice, refresh_course_rating,
)

DELETED_NAME = "حساب محذوف"
DELETED_EMAIL_DOMAIN = "deleted.baytara.invalid"
SELF_SERVICE_ROLES = ("student",)


def deleted_email(user_id):
    # .invalid is reserved (RFC 2606): nothing can ever be sent to it by mistake.
    return f"deleted-{user_id}@{DELETED_EMAIL_DOMAIN}"


def _remove_own_upload(url, user_id):
    """Delete a profile photo the learner uploaded themselves.

    Only names this account generated (u<id>_...). An admin may have pointed an avatar at
    a shared image, and that file is not this account's to take with it.
    """
    prefix = "/api/v1/uploads/"
    if not url or not url.startswith(prefix):
        return
    name = url[len(prefix):]
    if "/" in name or not name.startswith(f"u{user_id}_"):
        return
    path = os.path.join(current_app.config["UPLOAD_IMAGE_DIR"], name)
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def _remove_verification_files(user_id):
    """The card photos and national ID image, all kept under one folder per account."""
    root = os.path.realpath(current_app.config["BAYTARIAN_DOC_DIR"])
    folder = os.path.realpath(os.path.join(root, str(user_id)))
    if os.path.dirname(folder) != root:
        return
    shutil.rmtree(folder, ignore_errors=True)


def delete_account(user):
    """Anonymise `user` in the current session and commit. Files go after the commit,
    so a failed commit never leaves an account that still exists but lost its card."""
    uid = user.id

    reviewed = {r.course_id for r in CourseReview.query.filter_by(user_id=uid).all()}
    CourseReview.query.filter_by(user_id=uid).delete()
    db.session.flush()
    for course in Course.query.filter(Course.id.in_(reviewed)).all() if reviewed else []:
        refresh_course_rating(course)

    # A certificate verifies a named person to whoever scans it. With the name gone it
    # would verify nobody, so it stops verifying at all.
    Certificate.query.filter_by(user_id=uid).delete()
    CompletionCertificate.query.filter_by(user_id=uid).delete()
    Notification.query.filter_by(user_id=uid).delete()
    UserDevice.query.filter_by(user_id=uid).delete()
    DeviceSwapRequest.query.filter_by(user_id=uid).delete()
    BaytarianRequest.query.filter_by(user_id=uid).delete()

    avatar, cover = user.avatar_url, user.cover_url
    user.name = DELETED_NAME
    user.email = deleted_email(uid)
    user.phone = None
    user.password_hash = None
    user.google_sub = None
    user.national_id = None
    user.national_id_image = None
    user.vet_registration_no = None
    user.vet_license_no = None
    user.vet_governorate = None
    user.vet_card_expires_at = None
    user.is_baytarian = False
    user.is_vet_student = False
    user.headline = None
    user.bio = None
    user.avatar_url = None
    user.cover_url = None
    user.location = None
    user.expertise = None
    user.specialties = None
    user.is_active = False
    user.deleted_at = datetime.now(timezone.utc)
    db.session.commit()

    _remove_own_upload(avatar, uid)
    _remove_own_upload(cover, uid)
    _remove_verification_files(uid)


def may_self_delete(user: User):
    return user.role in SELF_SERVICE_ROLES and user.deleted_at is None
