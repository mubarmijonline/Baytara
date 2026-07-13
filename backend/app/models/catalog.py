from datetime import datetime, timezone

from ..extensions import db

COURSE_STATUSES = ("draft", "published", "unpublished")


def _now():
    return datetime.now(timezone.utc)


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    slug = db.Column(db.String(140), unique=True, nullable=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    courses = db.relationship("Course", back_populates="category")

    def to_dict(self):
        return {"id": self.id, "name": self.name, "slug": self.slug}


class Course(db.Model):
    __tablename__ = "courses"

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    slug = db.Column(db.String(220), unique=True, nullable=False, index=True)
    description = db.Column(db.Text, nullable=False, default="")
    image = db.Column(db.String(500))
    price = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    currency = db.Column(db.String(3), nullable=False, default="EGP")
    instructor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), index=True)
    duration_minutes = db.Column(db.Integer)
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    enrolled_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    category = db.relationship("Category", back_populates="courses")
    instructor = db.relationship("User")
    modules = db.relationship(
        "CourseModule", back_populates="course", order_by="CourseModule.position", cascade="all, delete-orphan"
    )

    def to_dict(self, with_content=False):
        d = {
            "id": self.id,
            "title": self.title,
            "slug": self.slug,
            "description": self.description,
            "image": self.image,
            "price": float(self.price),
            "currency": self.currency,
            "duration_minutes": self.duration_minutes,
            "status": self.status,
            "enrolled_count": self.enrolled_count,
            "category": self.category.to_dict() if self.category else None,
            "instructor": {"id": self.instructor.id, "name": self.instructor.name} if self.instructor else None,
        }
        if with_content:
            d["modules"] = [m.to_dict() for m in self.modules]
        return d


class CourseModule(db.Model):
    __tablename__ = "course_modules"

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)

    course = db.relationship("Course", back_populates="modules")
    lessons = db.relationship(
        "Lesson", back_populates="module", order_by="Lesson.position", cascade="all, delete-orphan"
    )

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "position": self.position,
            "lessons": [l.to_dict() for l in self.lessons],
        }


class Lesson(db.Model):
    __tablename__ = "lessons"

    id = db.Column(db.Integer, primary_key=True)
    module_id = db.Column(db.Integer, db.ForeignKey("course_modules.id"), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    position = db.Column(db.Integer, nullable=False, default=0)
    duration_minutes = db.Column(db.Integer)
    # ponytail: single video id on the lesson for now; a dedicated `videos` table
    # (multiple protected videos per lesson) lands in Phase 5 (VdoCipher) if needed.
    vdocipher_video_id = db.Column(db.String(120))
    is_protected = db.Column(db.Boolean, nullable=False, default=True)

    module = db.relationship("CourseModule", back_populates="lessons")

    def to_dict(self):
        return {
            "id": self.id,
            "title": self.title,
            "position": self.position,
            "duration_minutes": self.duration_minutes,
            "is_protected": self.is_protected,
            "has_video": bool(self.vdocipher_video_id),
        }
