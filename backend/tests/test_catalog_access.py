"""Reusable catalog schema self-check.

Run with ``python -m tests.test_catalog_access``. The tests package supplies a
fresh temporary SQLite database, and this module upgrades it to the migration
head before exercising the schema.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
import tempfile
import uuid

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from flask_migrate import upgrade
from app.models import (
    Bundle,
    Category,
    Course,
    CourseVideo,
    Enrollment,
    Lesson,
    User,
    VideoEntitlement,
)
from app.models.catalog import FIXED_CATEGORIES
from app.models.payment import Payment
from app.security import hash_password
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.services.catalog_access import CatalogValidationError, audience_error, validate_catalog_item
from app.services.catalog_access import video_access


MIGRATIONS_DIR = str(Path(__file__).resolve().parents[1] / "migrations")
PRE_CATALOG_REVISION = "49ad88f02a93"
pytestmark = pytest.mark.filterwarnings("ignore:.*get_engine.*:DeprecationWarning")


@pytest.fixture
def user_factory():
    def make_user(is_baytarian=False, role="student"):
        return SimpleNamespace(is_baytarian=is_baytarian, role=role)

    return make_user


@pytest.mark.parametrize("access_type,is_vet,expected", [
    ("free", False, None),
    ("vet_free", False, "needs_baytarian"),
    ("vet_free", True, None),
    ("baytarian", False, "needs_baytarian"),
    ("general", False, None),
    ("general", True, "non_veterinarians_only"),
])
def test_audience_error(user_factory, access_type, is_vet, expected):
    assert audience_error(user_factory(is_baytarian=is_vet), access_type) == expected


def test_published_item_requires_category_and_paid_price():
    with pytest.raises(CatalogValidationError) as exc:
        validate_catalog_item({"status": "published", "access_type": "baytarian", "price": 0})

    assert set(exc.value.errors) == {"category_required", "positive_price_required"}


def test_catalog_item_normalizes_free_price_and_rejects_invalid_commerce_fields():
    item = validate_catalog_item({
        "access_type": "free", "price": 120, "currency": "EGP", "access_days": None,
    })
    assert item["price"] == 0

    with pytest.raises(CatalogValidationError) as exc:
        validate_catalog_item({"access_type": "unknown", "currency": "USD", "access_days": 0})

    assert set(exc.value.errors) == {
        "invalid_access_type", "invalid_currency", "positive_access_days_required",
    }


def test_catalog_item_uses_current_values_for_partial_updates():
    current = SimpleNamespace(
        access_type="free", currency="EGP", price=0, access_days=None,
        status="draft", category_id=None,
    )

    item = validate_catalog_item({"price": 120}, current=current)

    assert item["price"] == 0


@pytest.fixture
def catalog_app(tmp_path):
    config = type("CatalogAccessConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'catalog-access.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


def test_video_access_honors_audience_entitlements_enrollment_and_assignment(catalog_app):
    with catalog_app.app_context():
        category = Category(name="Equine", slug="equine-access")
        instructor = User(name="Instructor", email="instructor-access@test", password_hash="hash", role="instructor")
        student = User(name="Student", email="student-access@test", password_hash="hash")
        baytarian = User(name="Baytarian", email="baytarian-access@test", password_hash="hash", is_baytarian=True)
        admin = User(name="Admin", email="admin-access@test", password_hash="hash", role="admin")
        db.session.add_all([category, instructor, student, baytarian, admin])
        db.session.flush()
        course = Course(
            title="General course", slug="general-course-access", instructor_id=instructor.id,
            category_id=category.id, price=100, access_type="general", status="published",
        )
        db.session.add(course)
        db.session.flush()
        video = Lesson(
            title="General video", category_id=category.id, price=100, access_type="general",
            status="published", vdocipher_video_id="access-video",
        )
        direct_video = Lesson(
            title="Direct video", course_id=course.id, category_id=category.id, price=100,
            access_type="general", status="published", vdocipher_video_id="direct-access-video",
        )
        db.session.add_all([video, direct_video])
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=video.id))
        db.session.commit()

        assert video_access(student, video) == (False, "not_entitled")
        assert video_access(baytarian, video) == (False, "non_veterinarians_only")
        assert video_access(instructor, video) == (True, None)
        assert video_access(instructor, direct_video) == (True, None)
        assert video_access(admin, video) == (True, None)

        db.session.add(VideoEntitlement(user_id=student.id, video_id=video.id, source="purchase"))
        db.session.commit()
        assert video_access(student, video) == (True, None)

        db.session.delete(VideoEntitlement.query.filter_by(user_id=student.id, video_id=video.id).one())
        enrollment = Enrollment(user_id=student.id, course_id=course.id, source="purchase")
        db.session.add(enrollment)
        db.session.commit()
        assert video_access(student, video) == (True, None)

        enrollment.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.session.commit()
        assert video_access(student, video) == (False, "access_expired")


def test_video_serializer_includes_commerce_and_assignment_metadata(catalog_app):
    with catalog_app.app_context():
        category = Category(name="Equine", name_en="Equine", slug="equine-serialized")
        instructor = User(name="Instructor", email="instructor-serialized@test", password_hash="hash", role="instructor")
        db.session.add_all([category, instructor])
        db.session.flush()
        course = Course(title="Course", slug="course-serialized", instructor_id=instructor.id, category_id=category.id)
        video = Lesson(
            title="Video", title_en="Video", category_id=category.id, criteria={"level": "advanced"},
            price=125, currency="EGP", access_days=30, access_type="general", status="published",
            duration_minutes=45,
        )
        db.session.add_all([course, video])
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=video.id))
        db.session.commit()

        assert video.to_dict(lang="en", user=instructor) == {
            "id": video.id,
            "title": "Video",
            "title_en": "Video",
            "description": "",
            "criteria": {"level": "advanced"},
            "position": 0,
            "duration_minutes": 45,
            "price": 125.0,
            "currency": "EGP",
            "access_days": 30,
            "access_type": "general",
            "is_paid": True,
            "lock_reason": None,
            "status": "published",
            "category": {"id": category.id, "name": "Equine", "name_en": "Equine", "slug": "equine-serialized"},
            "assignment_count": 1,
            "is_protected": True,
            "has_video": False,
            "course_id": None,
        }


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]

    with app.app_context():
        upgrade(directory=MIGRATIONS_DIR)
        expected_categories = [
            ("large-animals", "الحيوانات الكبيرة - الأبقار والأغنام", "Large animals - Cattle & Sheep"),
            ("equine", "الخيول", "Equine"),
            ("pet-animals", "الحيوانات الأليفة", "Pet animals"),
            ("poultry", "الدواجن والطيور", "Poultry"),
            ("fish-other-animal-sources", "الأسماك أو أي مصدر حيواني آخر", "Fish and other animal sources"),
            ("camel", "الجمال", "Camel"),
        ]
        categories = Category.query.order_by(Category.sort_order).all()
        assert FIXED_CATEGORIES == tuple(expected_categories)
        assert [(c.slug, c.name, c.name_en) for c in categories] == expected_categories
        assert [c.sort_order for c in categories] == list(range(6))
        assert all(c.is_fixed for c in categories)

        user = User(
            name="Catalog tester",
            email=f"catalog_{tag}@baytara.test",
            password_hash=hash_password("secret12"),
            role="instructor",
        )
        db.session.add(user)
        db.session.flush()
        equine = Category.query.filter_by(slug="equine").one()
        first = Course(
            title="First course",
            slug=f"first-{tag}",
            instructor_id=user.id,
            category_id=equine.id,
        )
        second = Course(
            title="Second course",
            slug=f"second-{tag}",
            instructor_id=user.id,
            category_id=equine.id,
        )
        video = Lesson(
            title="Equine exam",
            description="A reusable equine examination video.",
            category_id=equine.id,
            criteria={"level": "intermediate"},
            price=125,
            currency="EGP",
            access_days=30,
            access_type="general",
            status="draft",
            vdocipher_video_id=f"v-{tag}",
        )
        db.session.add_all([first, second, video])
        db.session.flush()
        db.session.add_all([
            CourseVideo(course_id=first.id, video_id=video.id, position=3),
            CourseVideo(course_id=second.id, video_id=video.id, position=1),
        ])
        bundle = Bundle(
            title="Equine package",
            slug=f"equine-package-{tag}",
            description="",
            price=125,
            access_type="general",
        )
        bundle.videos.append(video)
        payment = Payment(user_id=user.id, amount=125, video_id=video.id)
        entitlement = VideoEntitlement(user_id=user.id, video_id=video.id, source="purchase")
        db.session.add_all([bundle, payment, entitlement])
        db.session.commit()

        assert video.course_id is None and video.module_id is None
        assert [(a.course_id, a.position) for a in video.course_assignments] == [
            (first.id, 3),
            (second.id, 1),
        ]
        assert [item.id for item in first.ordered_videos] == [video.id]
        assert [item.id for item in video.courses] == [first.id, second.id]
        assert [item.id for item in bundle.videos] == [video.id]
        assert video.access_type == "general"
        assert video.description == "A reusable equine examination video."
        assert payment.video_id == video.id
        assert entitlement.has_access()

        duplicate = Lesson(title="Duplicate provider video", vdocipher_video_id=video.vdocipher_video_id)
        db.session.add(duplicate)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
        else:
            raise AssertionError("duplicate VdoCipher IDs must be rejected")
        db.session.add_all([Lesson(title="Legacy local draft"), Lesson(title="Another local draft")])
        db.session.commit()

        entitlement.status = "revoked"
        assert not entitlement.has_access()
        entitlement.status = "active"
        entitlement.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        assert not entitlement.has_access()

    print("catalog access self-check OK")


def test_fixed_taxonomy_and_reusable_video_models():
    demo()


def test_duplicate_legacy_vdocipher_ids_abort_before_schema_mutation():
    with tempfile.TemporaryDirectory(prefix="baytara-catalog-migration-") as temp_dir:
        database_url = f"sqlite:///{Path(temp_dir) / 'catalog.sqlite'}"
        config = type("MigrationTestConfig", (BaseConfig,), {
            "SQLALCHEMY_DATABASE_URI": database_url,
            "TESTING": True,
        })
        app = create_app(config)

        with app.app_context():
            upgrade(directory=MIGRATIONS_DIR, revision=PRE_CATALOG_REVISION)
            db.session.execute(text(
                "INSERT INTO users (id, name, email, password_hash, role, locale, is_active) "
                "VALUES (1, 'Legacy instructor', 'legacy@example.test', 'hash', 'instructor', 'ar', 1)"
            ))
            db.session.execute(text(
                "INSERT INTO categories (id, name, name_en, slug) "
                "VALUES (1, 'Legacy category', 'Legacy category', 'legacy-category')"
            ))
            db.session.execute(text(
                "INSERT INTO courses (id, title, slug, description, price, currency, instructor_id, category_id, "
                "status, enrolled_count) VALUES (1, 'Legacy course', 'legacy-course', '', 0, 'EGP', 1, 1, 'draft', 0)"
            ))
            db.session.execute(text(
                "INSERT INTO lessons (id, course_id, title, position, is_protected, vdocipher_video_id) "
                "VALUES (1, 1, 'Legacy video one', 0, 1, 'duplicate-legacy-vdo')"
            ))
            db.session.execute(text(
                "INSERT INTO lessons (id, course_id, title, position, is_protected, vdocipher_video_id) "
                "VALUES (2, 1, 'Legacy video two', 1, 1, 'duplicate-legacy-vdo')"
            ))
            db.session.commit()

            with pytest.raises(RuntimeError) as exc_info:
                upgrade.__wrapped__(directory=MIGRATIONS_DIR)

            message = str(exc_info.value)
            assert "duplicate VdoCipher IDs" in message
            assert "duplicate-legacy-vdo (2)" in message
            assert "Resolve duplicate provider IDs before retrying this migration." in message
            assert db.session.execute(text("SELECT COUNT(*) FROM lessons")).scalar_one() == 2
            assert db.session.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == PRE_CATALOG_REVISION
            assert "description" not in {
                row[1] for row in db.session.execute(text("PRAGMA table_info(lessons)"))
            }

            db.session.execute(text(
                "UPDATE lessons SET vdocipher_video_id = 'resolved-legacy-vdo' WHERE id = 2"
            ))
            db.session.commit()
            upgrade(directory=MIGRATIONS_DIR)

            assert db.session.execute(text("SELECT COUNT(*) FROM lessons")).scalar_one() == 2
            assert db.session.execute(text(
                "SELECT COUNT(*) FROM course_videos WHERE course_id = 1"
            )).scalar_one() == 2


if __name__ == "__main__":
    demo()
