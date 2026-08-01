from datetime import datetime, timezone

from ..extensions import db
from ..services.catalog_access import ACCESS_TYPES, PAID_ACCESS, access_is_paid, audience_error

COURSE_STATUSES = ("draft", "published", "unpublished")
FIXED_CATEGORIES = (
    ("large-animals", "الحيوانات الكبيرة - الأبقار والأغنام", "Large animals - Cattle & Sheep"),
    ("equine", "الخيول", "Equine"),
    ("pet-animals", "الحيوانات الأليفة", "Pet animals"),
    ("poultry", "الدواجن والطيور", "Poultry"),
    ("fish-other-animal-sources", "الأسماك أو أي مصدر حيواني آخر", "Fish and other animal sources"),
    ("camel", "الجمال", "Camel"),
)

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
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    is_fixed = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    courses = db.relationship("Course", back_populates="category")
    videos = db.relationship("Lesson", back_populates="category")

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
    # CourseVideo is the canonical course membership and ordering source. The
    # direct Lesson.course_id relationship remains only for legacy reads.
    videos = db.relationship(
        "Lesson", secondary="course_videos", viewonly=True, lazy="selectin",
        order_by="CourseVideo.position, Lesson.id",
    )
    legacy_videos = db.relationship(
        "Lesson", primaryjoin="Lesson.course_id==Course.id", foreign_keys="Lesson.course_id",
        viewonly=True, order_by="Lesson.position, Lesson.id",
    )
    video_assignments = db.relationship(
        "CourseVideo", back_populates="course", cascade="all, delete-orphan",
        order_by="CourseVideo.position, CourseVideo.id",
    )
    ordered_videos = db.relationship(
        "Lesson", secondary="course_videos", back_populates="courses", order_by="CourseVideo.position",
        viewonly=True, lazy="selectin",
    )

    def is_paid(self):
        return access_is_paid(self.access_type)

    def visible_to(self, user):
        """Whether the public catalog may list this course to the caller."""
        if self.access_type == "vet_free":
            return audience_error(user, self.access_type) is None
        return True

    def lock_reason(self, user):
        """None if the user may enroll/watch; else why it's locked."""
        return audience_error(user, self.access_type)

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
            d["videos"] = [l.to_dict(lang, user=user) for l in self.content_videos()]
        return d

    def content_videos(self):
        """Return canonical and legacy course rows once in a stable display order."""
        seen = set()
        rows = []

        def append(video):
            if video.id not in seen:
                seen.add(video.id)
                rows.append(video)

        for assignment in self.video_assignments:
            append(assignment.video)
        for video in self.legacy_videos:
            append(video)
        for module in self.modules:
            for video in module.lessons:
                append(video)
        return rows


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

    def to_dict(self, lang="ar", user=None):
        return {
            "id": self.id,
            "title": loc(self.title, self.title_en, lang),
            "title_en": self.title_en,
            "position": self.position,
            "lessons": [l.to_dict(lang, user=user) for l in self.lessons],
        }


class Lesson(db.Model):
    __tablename__ = "lessons"
    __table_args__ = (db.UniqueConstraint("vdocipher_video_id", name="uq_lessons_vdocipher_video_id"),)

    id = db.Column(db.Integer, primary_key=True)
    # Videos attach directly to a course now (NULL = standalone). module_id kept
    # nullable for legacy rows only.
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=True, index=True)
    module_id = db.Column(db.Integer, db.ForeignKey("course_modules.id"), nullable=True, index=True)
    title = db.Column(db.String(200), nullable=False)
    title_en = db.Column(db.String(200))
    description = db.Column(db.Text, nullable=False, default="")
    description_en = db.Column(db.Text)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), index=True)
    price = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    currency = db.Column(db.String(3), nullable=False, default="EGP")
    access_days = db.Column(db.Integer)
    access_type = db.Column(db.String(20), nullable=False, default="general", server_default="general", index=True)
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    position = db.Column(db.Integer, nullable=False, default=0)
    duration_minutes = db.Column(db.Integer)
    vdocipher_video_id = db.Column(db.String(120))
    is_protected = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=_now, onupdate=_now)

    module = db.relationship("CourseModule", back_populates="lessons")
    category = db.relationship("Category", back_populates="videos")
    course_assignments = db.relationship(
        "CourseVideo", back_populates="video", cascade="all, delete-orphan", order_by="CourseVideo.course_id",
    )
    courses = db.relationship(
        "Course", secondary="course_videos", back_populates="ordered_videos", viewonly=True, lazy="selectin",
    )

    def resolve_course_id(self):
        """Course this video belongs to: direct course_id, else via its legacy module."""
        if self.course_id:
            return self.course_id
        if self.module_id:
            return db.session.query(CourseModule.course_id).filter_by(id=self.module_id).scalar()
        return None

    def to_dict(self, lang="ar", user=None):
        return {
            "id": self.id,
            "title": loc(self.title, self.title_en, lang),
            "title_en": self.title_en,
            "description": loc(self.description, self.description_en, lang),
            "description_en": self.description_en,
            "position": self.position,
            "duration_minutes": self.duration_minutes,
            "price": float(self.price),
            "currency": self.currency,
            "access_days": self.access_days,
            "access_type": self.access_type,
            "is_paid": access_is_paid(self.access_type),
            "lock_reason": audience_error(user, self.access_type),
            "status": self.status,
            "category": self.category.to_dict(lang) if self.category else None,
            "assignment_count": len(self.course_assignments),
            "is_protected": self.is_protected,
            "has_video": bool(self.vdocipher_video_id),
            "course_id": self.course_id,
        }


# Course Bundling (contract البند3): merge 2+ courses, sold at a custom discounted price.
bundle_courses = db.Table(
    "bundle_courses",
    db.Column("bundle_id", db.Integer, db.ForeignKey("bundles.id", ondelete="CASCADE"), primary_key=True),
    db.Column("course_id", db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True),
)

bundle_videos = db.Table(
    "bundle_videos",
    db.Column("bundle_id", db.Integer, db.ForeignKey("bundles.id", ondelete="CASCADE"), primary_key=True),
    db.Column("video_id", db.Integer, db.ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True),
)


class CourseVideo(db.Model):
    __tablename__ = "course_videos"
    __table_args__ = (db.UniqueConstraint("course_id", "video_id", name="uq_course_video"),)

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    video_id = db.Column(db.Integer, db.ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False, index=True)
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    course = db.relationship("Course", back_populates="video_assignments")
    video = db.relationship("Lesson", back_populates="course_assignments")


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
    access_type = db.Column(db.String(20), nullable=False, default="general", server_default="general", index=True)
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    courses = db.relationship("Course", secondary=bundle_courses, lazy="selectin")
    videos = db.relationship("Lesson", secondary=bundle_videos, lazy="selectin")

    def courses_total(self):
        return float(sum((c.price for c in self.courses), 0))

    def to_dict(self, with_courses=True, lang="ar", user=None):
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
            "access_type": self.access_type,
            "is_paid": access_is_paid(self.access_type),
            "lock_reason": audience_error(user, self.access_type),
            "status": self.status,
            "courses_total": self.courses_total(),
            "course_ids": [course.id for course in self.courses],
            "video_ids": [video.id for video in self.videos],
        }
        if with_courses:
            d["courses"] = [c.to_dict(lang=lang, user=user) for c in self.courses]
            d["videos"] = [video.to_dict(lang=lang, user=user) for video in self.videos]
        return d
