from datetime import datetime, timezone

from ..extensions import db

COURSE_STATUSES = ("draft", "published", "unpublished")

# Content access model (client البند3 revision):
#   free      -> anyone, no payment
#   vet_free  -> free, but only Baytara doctor INSTRUCTORS (role == instructor)
#   baytarian -> PAID, only verified pet-doctor (Baytarian) users
#   general   -> anyone, PAID
ACCESS_TYPES = ("free", "vet_free", "baytarian", "general")
PAID_ACCESS = ("baytarian", "general")


def access_is_paid(t):
    return t in PAID_ACCESS


def _now():
    return datetime.now(timezone.utc)


def loc(base, en, lang):
    """Localized value: English when lang=='en' and an English value exists, else the
    Arabic base (contract البند1: AR default + fallback)."""
    return en if (lang == "en" and en) else base


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    name_en = db.Column(db.String(120))
    slug = db.Column(db.String(140), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    courses = db.relationship("Course", back_populates="category")

    def to_dict(self, lang="ar"):
        return {"id": self.id, "name": loc(self.name, self.name_en, lang),
                "name_en": self.name_en, "slug": self.slug}


class Course(db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    title_en = db.Column(db.String(200))
    slug = db.Column(db.String(220), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=False, default="")
    description_en = db.Column(db.Text)
    image = db.Column(db.String(500))
    price = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    currency = db.Column(db.String(3), nullable=False, default="EGP")
    instructor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), index=True)
    duration_minutes = db.Column(db.Integer)
    # Access Duration (contract البند3): days of access after enrollment. NULL = lifetime.
    access_days = db.Column(db.Integer)
    # Access model: free | vet_free | baytarian | general (see ACCESS_TYPES).
    access_type = db.Column(db.String(20), nullable=False, default="general",
                            server_default="general", index=True)
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    enrolled_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    category = db.relationship("Category", back_populates="courses")
    instructor = db.relationship("User")
    modules = db.relationship(
        "CourseModule", back_populates="course", order_by="CourseModule.position", cascade="all, delete-orphan"
    )

    def is_paid(self):
        return access_is_paid(self.access_type)

    def visible_to(self, user):
        """Listable to this user? vet_free is instructor/admin-only; baytarian is
        shown-but-locked to everyone (client decision)."""
        if self.access_type == "vet_free":
            return bool(user and user.role in ("instructor", "admin"))
        return True

    def lock_reason(self, user):
        """None if the user may enroll/watch; else why it's locked."""
        role = getattr(user, "role", None)
        if role == "admin":
            return None
        if self.access_type == "vet_free" and role != "instructor":
            return "instructors_only"
        if self.access_type == "baytarian" and not getattr(user, "is_baytarian", False):
            return "needs_baytarian"
        return None

    def accessible_to(self, user):
        return self.lock_reason(user) is None

    def to_dict(self, with_content=False, lang="ar", user=None):
        d = {
            "id": self.id,
            "title": loc(self.title, self.title_en, lang),
            "title_en": self.title_en,
            "slug": self.slug,
            "description": loc(self.description, self.description_en, lang),
            "description_en": self.description_en,
            "image": self.image,
            "price": float(self.price),
            "currency": self.currency,
            "duration_minutes": self.duration_minutes,
            "access_days": self.access_days,
            "access_type": self.access_type,
            "is_paid": self.is_paid(),
            "lock_reason": self.lock_reason(user),
            "status": self.status,
            "enrolled_count": self.enrolled_count,
            "category": self.category.to_dict(lang) if self.category else None,
            "instructor": {"id": self.instructor.id, "name": self.instructor.name} if self.instructor else None,
        }
        if with_content:
            d["modules"] = [m.to_dict(lang) for m in self.modules]
        return d


class CourseModule(db.Model):
    __tablename__ = "course_modules"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    title_en = db.Column(db.String(200))
    position = db.Column(db.Integer, nullable=False, default=0)

    course = db.relationship("Course", back_populates="modules")
    lessons = db.relationship(
        "Lesson", back_populates="module", order_by="Lesson.position", cascade="all, delete-orphan"
    )

    def to_dict(self, lang="ar"):
        return {
            "id": self.id,
            "title": loc(self.title, self.title_en, lang),
            "title_en": self.title_en,
            "position": self.position,
            "lessons": [l.to_dict(lang) for l in self.lessons],
        }


class Lesson(db.Model):
    __tablename__ = "lessons"

    id = db.Column(db.Integer, primary_key=True)
    module_id = db.Column(db.Integer, db.ForeignKey("course_modules.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    title_en = db.Column(db.String(200))
    position = db.Column(db.Integer, nullable=False, default=0)
    duration_minutes = db.Column(db.Integer)
    # ponytail: single video id on the lesson for now; a dedicated `videos` table
    # (multiple protected videos per lesson) lands in Phase 5 (VdoCipher) if needed.
    vdocipher_video_id = db.Column(db.String(120))
    is_protected = db.Column(db.Boolean, nullable=False, default=True)

    module = db.relationship("CourseModule", back_populates="lessons")

    def to_dict(self, lang="ar"):
        return {
            "id": self.id,
            "title": loc(self.title, self.title_en, lang),
            "title_en": self.title_en,
            "position": self.position,
            "duration_minutes": self.duration_minutes,
            "is_protected": self.is_protected,
            "has_video": bool(self.vdocipher_video_id),
        }


# Course Bundling (contract البند3): merge 2+ courses, sold at a custom discounted price.
bundle_courses = db.Table(
    "bundle_courses",
    db.Column("bundle_id", db.Integer, db.ForeignKey("bundles.id", ondelete="CASCADE"), primary_key=True),
    db.Column("course_id", db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True),
)


class Bundle(db.Model):
    __tablename__ = "bundles"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    title_en = db.Column(db.String(200))
    slug = db.Column(db.String(220), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=False, default="")
    description_en = db.Column(db.Text)
    image = db.Column(db.String(500))
    price = db.Column(db.Numeric(10, 2), nullable=False, default=0)  # custom discounted price
    currency = db.Column(db.String(3), nullable=False, default="EGP")
    access_days = db.Column(db.Integer)  # NULL = lifetime; applies to every course in the bundle
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    courses = db.relationship("Course", secondary=bundle_courses, lazy="selectin")

    def courses_total(self):
        return float(sum((c.price for c in self.courses), 0))

    def to_dict(self, with_courses=True, lang="ar"):
        d = {
            "id": self.id,
            "title": loc(self.title, self.title_en, lang),
            "title_en": self.title_en,
            "slug": self.slug,
            "description": loc(self.description, self.description_en, lang),
            "description_en": self.description_en,
            "image": self.image,
            "price": float(self.price),
            "currency": self.currency,
            "access_days": self.access_days,
            "status": self.status,
            "courses_total": self.courses_total(),
        }
        if with_courses:
            d["courses"] = [c.to_dict(lang=lang) for c in self.courses]
        return d
