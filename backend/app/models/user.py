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
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="student")
    locale = db.Column(db.String(10), nullable=False, default="ar")
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<User {self.id} {self.email} {self.role}>"
