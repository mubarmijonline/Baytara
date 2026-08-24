from datetime import datetime, timezone

from ..extensions import db
from ..services.catalog_access import ACCESS_TYPES, PAID_ACCESS, access_is_paid, audience_error

COURSE_STATUSES = ("draft", "published", "unpublished")
# Shared by Course and LearningPath; the visible labels live in the frontend DICT.
LEVELS = ("beginner", "intermediate", "advanced", "breeders")
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
    # «ماذا ستتعلّم» bullets. JSON lists rather than paired scalars; loc() treats an empty
    # list as falsy, so an unfilled English list falls back to Arabic like every other field.
    objectives = db.Column(db.JSON, nullable=False, default=list)
    objectives_en = db.Column(db.JSON, nullable=False, default=list)
    level = db.Column(db.String(20), nullable=False, default="beginner", server_default="beginner", index=True)
    has_certificate = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
    # Running totals so a listing of 50 cards costs no aggregate queries. Maintained by
    # the review endpoints; see CourseReview.
    rating_sum = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    rating_count = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=_now, onupdate=_now)

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

    def video_minutes(self):
        """Real content length: the sum of the course's video durations."""
        return sum((v.duration_minutes or 0) for v in self.content_videos())

    def rating(self):
        """Average score, or None when nobody has reviewed it. Never 0 — a zero would
        read as a bad course rather than an unrated one."""
        if not self.rating_count:
            return None
        return round(self.rating_sum / self.rating_count, 1)

    def content_updated_at(self):
        """«آخر تحديث»: the latest change to the course row or to any of its videos.
        Adding a lesson is an update to the course as far as a learner is concerned."""
        stamps = [self.updated_at] + [v.updated_at for v in self.content_videos()]
        stamps = [s for s in stamps if s is not None]
        return max(stamps).isoformat() if stamps else None

    def grouped_videos(self, lang="ar", user=None):
        """Videos grouped into units for the curriculum accordion.

        Same dedupe order as content_videos(), so the grouped view and the flat `videos`
        list always hold the same rows. Anything not placed in a unit lands in one leading
        group with a null id, which the frontend renders as a single implicit unit.
        """
        seen, groups, order = set(), {}, []

        def add(module, video):
            if not video or video.id in seen:
                return
            seen.add(video.id)
            key = module.id if module else None
            if key not in groups:
                groups[key] = {
                    "id": key,
                    "title": loc(module.title, module.title_en, lang) if module else None,
                    "position": module.position if module else -1,
                    "videos": [],
                }
                order.append(key)
            groups[key]["videos"].append(video)

        for assignment in self.video_assignments:
            add(assignment.module, assignment.video)
        for video in self.legacy_videos:
            add(video.module, video)
        for module in self.modules:
            for video in module.lessons:
                add(module, video)

        units = sorted((groups[k] for k in order), key=lambda g: g["position"])
        for unit in units:
            videos = unit.pop("videos")
            unit["lessons_count"] = len(videos)
            unit["total_minutes"] = sum((v.duration_minutes or 0) for v in videos)
            unit["videos"] = [v.to_dict(lang, user=user) for v in videos]
        return units

    def to_dict(self, with_content=False, lang="ar", user=None):
        vids = self.content_videos()
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
            # duration_minutes: what admins typed; video_minutes/lessons_count are the
            # real figures computed from the videos actually attached to the course.
            "duration_minutes": self.duration_minutes,
            "video_minutes": self.video_minutes(),
            "lessons_count": len(vids),
            "access_days": self.access_days,
            "access_type": self.access_type,
            "is_paid": self.is_paid(),
            "lock_reason": self.lock_reason(user),
            "status": self.status,
            "enrolled_count": self.enrolled_count,
            "objectives": loc(self.objectives or [], self.objectives_en or [], lang),
            "objectives_en": self.objectives_en or [],
            "level": self.level,
            "has_certificate": self.has_certificate,
            "rating": self.rating(),
            "reviews_count": self.rating_count,
            "category": self.category.to_dict(lang) if self.category else None,
            "instructor": {"id": self.instructor.id, "name": self.instructor.name,
                           "headline": self.instructor.headline,
                           "avatar_url": self.instructor.avatar_url} if self.instructor else None,
        }
        if with_content:
            # The flat list stays: the player and the existing clients read it.
            d["videos"] = [l.to_dict(lang, user=user) for l in vids]
            d["modules"] = self.grouped_videos(lang=lang, user=user)
            # Every unit the course owns, including ones with nothing in them yet. The
            # grouped list above drops those, which would hide a unit the admin just made.
            d["all_modules"] = [{"id": m.id, "title": loc(m.title, m.title_en, lang),
                                 "title_en": m.title_en, "position": m.position}
                                for m in self.modules]
            d["content_updated_at"] = self.content_updated_at()
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
    # Who presents this video. Nullable in the schema because rows predate the column;
    # the admin API requires it on every create and update from here on.
    instructor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True, index=True)
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
    poster = db.Column(db.String(1000))
    vdocipher_video_id = db.Column(db.String(120))
    is_protected = db.Column(db.Boolean, nullable=False, default=True)
    # Where the video lives: "vdocipher" (DRM provider) or "local" (this server, encrypted
    # HLS served behind a signed token). Same catalog, same gates, different delivery.
    source = db.Column(db.String(20), nullable=False, default="vdocipher", index=True)
    local_status = db.Column(db.String(20))       # uploading | packaging | ready | failed
    local_error = db.Column(db.String(200))
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=_now, onupdate=_now)

    module = db.relationship("CourseModule", back_populates="lessons")
    category = db.relationship("Category", back_populates="videos")
    instructor = db.relationship("User", foreign_keys=[instructor_id])
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
            "poster": self.poster,
            "price": float(self.price),
            "currency": self.currency,
            "access_days": self.access_days,
            "access_type": self.access_type,
            "is_paid": access_is_paid(self.access_type),
            "lock_reason": audience_error(user, self.access_type),
            "status": self.status,
            "category": self.category.to_dict(lang) if self.category else None,
            "instructor": {"id": self.instructor.id, "name": self.instructor.name,
                           "headline": self.instructor.headline,
                           "avatar_url": self.instructor.avatar_url} if self.instructor else None,
            "instructor_id": self.instructor_id,
            "assignment_count": len(self.course_assignments),
            "is_protected": self.is_protected,
            "source": self.source,
            "local_status": self.local_status,
            "has_video": bool(self.vdocipher_video_id
                                or (self.source == "local" and self.local_status == "ready")),
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
    # Which unit this video sits in *for this course*. A video reused by three courses can
    # be unit 1 in one and unit 3 in another, so the grouping belongs here and not on Lesson.
    module_id = db.Column(db.Integer, db.ForeignKey("course_modules.id", ondelete="SET NULL"),
                          nullable=True, index=True)
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    course = db.relationship("Course", back_populates="video_assignments")
    video = db.relationship("Lesson", back_populates="course_assignments")
    module = db.relationship("CourseModule")


class CourseReview(db.Model):
    """One review per learner per course. Moderation is publish-then-hide: a review is
    visible immediately and an admin can pull it, which also adjusts the course average
    so the score always matches what a visitor can actually read."""

    __tablename__ = "course_reviews"
    __table_args__ = (db.UniqueConstraint("course_id", "user_id", name="uq_course_review_user"),)

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rating = db.Column(db.SmallInteger, nullable=False)
    body = db.Column(db.Text, nullable=False, default="")
    status = db.Column(db.String(20), nullable=False, default="published", server_default="published", index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=_now, onupdate=_now)

    course = db.relationship("Course")
    user = db.relationship("User")

    def to_dict(self, admin=False):
        d = {
            "id": self.id,
            "rating": self.rating,
            "body": self.body,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "author": {"name": self.user.name, "avatar_url": self.user.avatar_url} if self.user else None,
        }
        if admin:
            d.update({
                "status": self.status,
                "user_id": self.user_id,
                "course": {"id": self.course.id, "title": self.course.title, "slug": self.course.slug}
                if self.course else None,
            })
        return d


def refresh_course_rating(course):
    """Recompute a course's running totals from its published reviews.

    ponytail: recount rather than apply a delta. Writes are rare and reads are on every
    card, so the cheap thing to keep correct is the read — and a recount cannot drift.
    """
    count, total = (db.session.query(
        db.func.count(CourseReview.id), db.func.coalesce(db.func.sum(CourseReview.rating), 0))
        .filter(CourseReview.course_id == course.id, CourseReview.status == "published")
        .one())
    course.rating_count = int(count or 0)
    course.rating_sum = int(total or 0)


class LearningPath(db.Model):
    """An ordered shelf of courses — «مسار». A path carries no price and no access tier;
    each course inside it keeps its own gating."""

    __tablename__ = "learning_paths"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    title_en = db.Column(db.String(200))
    slug = db.Column(db.String(220), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=False, default="")
    description_en = db.Column(db.Text)
    level = db.Column(db.String(20), nullable=False, default="beginner", server_default="beginner", index=True)
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0, server_default="0")
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    course_assignments = db.relationship(
        "PathCourse",
        back_populates="path",
        cascade="all, delete-orphan",
        order_by="PathCourse.position, PathCourse.id",
        lazy="selectin",
    )

    def steps(self):
        """The published courses on this path, in author order. Draft courses are skipped
        so a work-in-progress cannot inflate the card."""
        return [a.course for a in self.course_assignments if a.course and a.course.status == "published"]

    def to_dict(self, lang="ar", with_courses=False, user=None):
        steps = self.steps()
        d = {
            "id": self.id,
            "title": loc(self.title, self.title_en, lang),
            "title_en": self.title_en,
            "slug": self.slug,
            "description": loc(self.description, self.description_en, lang),
            "description_en": self.description_en,
            "level": self.level,
            "status": self.status,
            "sort_order": self.sort_order,
            "courses_count": len(steps),
            "total_minutes": sum(c.video_minutes() for c in steps),
            "steps": [{"id": c.id, "slug": c.slug, "title": loc(c.title, c.title_en, lang), "position": i}
                      for i, c in enumerate(steps)],
            "start_slug": steps[0].slug if steps else None,
        }
        if with_courses:
            d["courses"] = [c.to_dict(lang=lang, user=user) for c in steps]
        return d


class PathCourse(db.Model):
    __tablename__ = "path_courses"
    __table_args__ = (db.UniqueConstraint("path_id", "course_id", name="uq_path_course"),)

    id = db.Column(db.Integer, primary_key=True)
    path_id = db.Column(db.Integer, db.ForeignKey("learning_paths.id", ondelete="CASCADE"), nullable=False, index=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True)
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    path = db.relationship("LearningPath", back_populates="course_assignments")
    course = db.relationship("Course", lazy="joined")


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
