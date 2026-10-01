from datetime import datetime, timezone

from ..extensions import db

# ponytail: role as a plain string column (student/instructor/admin). Granular
# RBAC tables (roles/permissions/role_permissions) added in Phase 6 when the
# instructor permission flags need them — not before.
ROLES = ("student", "instructor", "admin")


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    phone = db.Column(db.String(40))  # shown in the dynamic video watermark (anti-piracy)
    # NULL for Google-only accounts (no password was ever set). verify_password
    # rejects a blank hash, so such an account cannot be logged into by password.
    password_hash = db.Column(db.String(255))
    # Google's stable subject id. Preferred over email for identity: a Google
    # account can change its email, and the sub never changes.
    google_sub = db.Column(db.String(64), unique=True, index=True)
    role = db.Column(db.String(20), nullable=False, default="student")
    locale = db.Column(db.String(10), nullable=False, default="ar")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    # Baytarian = verified pet doctor (admin-approved via document upload). Gates
    # access to baytarian-tier courses (client البند3 revision).
    is_baytarian = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))
    # A veterinary student is not a veterinarian, and the badge must keep meaning what it
    # says. Students get their own status: it opens the free vet-tier content that brings
    # them to the platform, and nothing that is sold to licensed doctors.
    is_vet_student = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))
    # Identity for verification. The national ID is what ties a syndicate card to this
    # account, so it is unique and write-once for the learner: once set, only an admin
    # may change it. Never returned by public_profile() — this is not public data.
    national_id = db.Column(db.String(14), unique=True, index=True)
    # Photo of the ID card, stored with the verification documents rather than in
    # the public uploads folder: it is served only to its owner and to admins.
    national_id_image = db.Column(db.String(500))
    # Read off the card at verification time and kept so the profile can show what was
    # verified and when it lapses.
    vet_registration_no = db.Column(db.String(20))
    vet_license_no = db.Column(db.String(20))
    vet_governorate = db.Column(db.String(40))
    vet_card_expires_at = db.Column(db.Date)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    # Set when the learner closed the account themselves (services/account_deletion.py).
    # The row stays, anonymised, because payments and enrolments point at it.
    deleted_at = db.Column(db.DateTime(timezone=True))

    # instructor public-profile fields (used when role == instructor)
    headline = db.Column(db.String(200))
    bio = db.Column(db.Text)
    avatar_url = db.Column(db.String(500))
    cover_url = db.Column(db.String(500))
    location = db.Column(db.String(120))
    expertise = db.Column(db.JSON)  # list[str]
    # Self-service specialties, held as category slugs rather than free text so the
    # profile and the catalogue always name a specialty the same way. `expertise`
    # stays as it is: admins write prose there ("استشاري كبرى مزارع الدواجن").
    specialties = db.Column(db.JSON)  # list[str] of Category.slug
    # Per-account device allowance. NULL = the contract default (UserDevice.MAX_DEVICES).
    # Raised only for staff/testing accounts, never as a way around البند2 for buyers.
    max_devices = db.Column(db.Integer)
    # Self-service device swaps. The client allows one per subscription window -- long
    # enough that buying a phone is covered, short enough that passing an account around is
    # not. `device_swap_grants` is what an admin adds when they approve a request.
    device_swaps_used = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    device_swap_window_start = db.Column(db.DateTime(timezone=True))
    device_swap_grants = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    # Section the instructor is listed under on the site (e.g. الخيول). NULL = unassigned.
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), index=True)

    category = db.relationship("Category")

    # instructor video permission flags (admin-toggled; defaults per plan §10)
    can_add_video = db.Column(db.Boolean, nullable=False, default=True, server_default=db.text("true"))
    can_edit_video = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))
    can_delete_video = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))

    def public_profile(self, lang="ar"):
        return {
            "id": self.id,
            "name": self.name,
            "headline": self.headline,
            "bio": self.bio,
            "avatar_url": self.avatar_url,
            "expertise": self.expertise or [],
            "specialties": self.specialties or [],
            "category": self.category.to_dict(lang) if self.category else None,
        }

    def __repr__(self):
        return f"<User {self.id} {self.email} {self.role}>"


BAYTARIAN_STATUSES = ("pending", "approved", "rejected")


class BaytarianRequest(db.Model):
    """A user's request to be verified as a Baytarian (pet doctor). Documents
    (PDF/images) are uploaded and an admin approves/rejects."""

    __tablename__ = "baytarian_requests"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    status = db.Column(db.String(20), nullable=False, default="pending", index=True)
    documents = db.Column(db.JSON)  # list[str] of stored file paths
    note = db.Column(db.String(500))  # applicant note (clinic, license no., etc.)
    # Card verification evidence. Kept in full so an auto-approval can be re-examined
    # or undone later: a decision made by a machine still has to be answerable.
    card_front = db.Column(db.String(500))
    card_back = db.Column(db.String(500))
    ocr_text = db.Column(db.Text)
    parsed = db.Column(db.JSON)      # every field read, with its verdict
    # Which door the applicant came through, what a model made of their document, and
    # what the decision granted. Stored even when the answer was "I cannot tell", so the
    # admin reviewing it by hand sees what was already read rather than starting cold.
    route = db.Column(db.String(20), nullable=False, default="manual", server_default="manual")
    ai_verdict = db.Column(db.JSON)
    # "granted" in the database because GRANT is a reserved word in Postgres and an
    # unquoted UPDATE on it is a syntax error.
    grant = db.Column("granted", db.String(20))   # baytarian | vet_student
    auto_approved = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))
    spot_check = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))
    reject_reason = db.Column(db.String(300))
    reviewed_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    reviewed_at = db.Column(db.DateTime(timezone=True))
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    user = db.relationship("User", foreign_keys=[user_id])

    def to_dict(self, admin=False):
        d = {
            "id": self.id,
            "status": self.status,
            "note": self.note,
            "reject_reason": self.reject_reason,
            "documents_count": len(self.documents or []),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "reviewed_at": self.reviewed_at.isoformat() if self.reviewed_at else None,
        }
        d.update(auto_approved=self.auto_approved, spot_check=self.spot_check,
                 parsed=self.parsed or None, route=self.route, grant=self.grant)
        if admin:
            d.update(user_id=self.user_id, ai_verdict=self.ai_verdict or None,
                     user={"id": self.user.id, "name": self.user.name, "email": self.user.email} if self.user else None,
                     documents=self.documents or [],
                     has_card=bool(self.card_front or self.card_back),
                     ocr_text=self.ocr_text)
        return d


class UserDevice(db.Model):
    """Device Limit (contract البند2): max 2 devices per account. A device is a
    client-generated stable id (localStorage UUID) sent on login. A 3rd distinct
    device is blocked until one is removed."""

    __tablename__ = "user_devices"
    __table_args__ = (
        db.UniqueConstraint("user_id", "device_id", name="uq_device_user_device"),
        # The limit counts one user's groups, so the lookup is always by both. Declared
        # here as the device_group migration built it; a bare index on device_group
        # alone was what the model used to claim, and never existed.
        db.Index("ix_user_devices_user_group", "user_id", "device_group"),
    )

    MAX_DEVICES = 2

    @property
    def group(self):
        """What the limit actually counts. A row with no signature is its own device."""
        return self.device_group or self.device_id

    @staticmethod
    def groups_for(user_id):
        rows = UserDevice.query.filter_by(user_id=user_id).all()
        return {row.group for row in rows}

    @staticmethod
    def limit_for(user):
        """Device allowance for this account: its override, else the contract default."""
        return int(getattr(user, "max_devices", None) or UserDevice.MAX_DEVICES)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    device_id = db.Column(db.String(80), nullable=False)
    # The machine this browser runs on. Browsers cannot share storage, so each one has
    # its own device_id; they share a group when they report the same machine, and the
    # limit counts groups. NULL for rows that predate it, which then stand alone.
    device_group = db.Column(db.String(64))
    label = db.Column(db.String(160))  # user-agent snippet for the user to recognize it
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "device_group": self.group,
            "label": self.label,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
        }


class DeviceSwapRequest(db.Model):
    """A learner asking an admin to free a device slot after their one swap is spent.

    The client's rule (2026-09-19): a learner may swap a machine themselves once per
    subscription window -- someone who buys a new phone should not need anyone's help --
    and anything beyond that goes to an admin, because repeated swapping is what account
    sharing looks like.
    """

    __tablename__ = "device_swap_requests"

    STATUSES = ("pending", "approved", "rejected")

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    reason = db.Column(db.String(500), nullable=False, default="")
    status = db.Column(db.String(16), nullable=False, default="pending", index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    decided_at = db.Column(db.DateTime(timezone=True))
    decided_by_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="SET NULL"))

    user = db.relationship("User", foreign_keys=[user_id])
    decided_by = db.relationship("User", foreign_keys=[decided_by_id])

    def to_dict(self):
        return {
            "id": self.id,
            "status": self.status,
            "reason": self.reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "decided_at": self.decided_at.isoformat() if self.decided_at else None,
            "user": {"id": self.user.id, "name": self.user.name, "email": self.user.email,
                     "phone": self.user.phone} if self.user else None,
        }
