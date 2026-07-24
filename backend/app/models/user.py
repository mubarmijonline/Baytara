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
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="student")
    locale = db.Column(db.String(10), nullable=False, default="ar")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # instructor public-profile fields (used when role == instructor)
    headline = db.Column(db.String(200))
    bio = db.Column(db.Text)
    avatar_url = db.Column(db.String(500))
    expertise = db.Column(db.JSON)  # list[str]

    # instructor video permission flags (admin-toggled; defaults per plan §10)
    can_add_video = db.Column(db.Boolean, nullable=False, default=True, server_default=db.text("true"))
    can_edit_video = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))
    can_delete_video = db.Column(db.Boolean, nullable=False, default=False, server_default=db.text("false"))

    def public_profile(self):
        return {
            "id": self.id,
            "name": self.name,
            "headline": self.headline,
            "bio": self.bio,
            "avatar_url": self.avatar_url,
            "expertise": self.expertise or [],
        }

    def __repr__(self):
        return f"<User {self.id} {self.email} {self.role}>"


class UserDevice(db.Model):
    """Device Limit (contract البند2): max 2 devices per account. A device is a
    client-generated stable id (localStorage UUID) sent on login. A 3rd distinct
    device is blocked until one is removed."""

    __tablename__ = "user_devices"
    __table_args__ = (db.UniqueConstraint("user_id", "device_id", name="uq_device_user_device"),)

    MAX_DEVICES = 2

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    device_id = db.Column(db.String(80), nullable=False)
    label = db.Column(db.String(160))  # user-agent snippet for the user to recognize it
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "id": self.id,
            "device_id": self.device_id,
            "label": self.label,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
        }
