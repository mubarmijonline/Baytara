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


def _headers(client, email):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": "secret12"})
    assert response.status_code == 200, response.get_json()
    token = response.get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


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


def test_course_routes_validate_merged_catalog_state(catalog_app):
    with catalog_app.app_context():
        admin = User(name="Admin", email="admin-validation@example.test", password_hash=hash_password("secret12"), role="admin")
        instructor = User(name="Instructor", email="instructor-validation@example.test", password_hash=hash_password("secret12"), role="instructor")
        category = Category(name="Equine", slug="equine-validation")
        db.session.add_all([admin, instructor, category])
        db.session.flush()
        existing = Course(
            title="Existing", slug="existing-validation", instructor_id=instructor.id,
            category_id=category.id, price=100, access_type="general", status="draft",
        )
        db.session.add(existing)
        db.session.commit()
        admin_id, instructor_id, category_id, existing_id = admin.id, instructor.id, category.id, existing.id

    client = catalog_app.test_client()
    admin_headers = _headers(client, "admin-validation@example.test")
    instructor_headers = _headers(client, "instructor-validation@example.test")

    missing_category = client.post("/api/v1/admin/courses", headers=admin_headers, json={
        "title": "Missing category", "instructor_id": instructor_id, "status": "published",
        "access_type": "baytarian", "price": 100,
    })
    assert missing_category.status_code == 422
    assert missing_category.get_json() == {"error": "catalog_validation_failed", "errors": ["category_required"]}

    invalid_admin = client.patch(f"/api/v1/admin/courses/{existing_id}", headers=admin_headers, json={
        "price": 0, "currency": "USD", "access_days": 0,
    })
    assert invalid_admin.status_code == 422
    assert invalid_admin.get_json() == {
        "error": "catalog_validation_failed",
        "errors": ["invalid_currency", "positive_price_required", "positive_access_days_required"],
    }

    invalid_instructor = client.post("/api/v1/instructor/courses", headers=instructor_headers, json={
        "title": "Invalid published", "status": "published", "access_type": "general", "price": 0,
    })
    assert invalid_instructor.status_code == 422
    assert set(invalid_instructor.get_json()["errors"]) == {"category_required", "positive_price_required"}

    invalid_instructor_update = client.patch(
        f"/api/v1/instructor/courses/{existing_id}", headers=instructor_headers,
        json={"currency": "USD", "access_days": 0},
    )
    assert invalid_instructor_update.status_code == 422
    assert invalid_instructor_update.get_json()["errors"] == ["invalid_currency", "positive_access_days_required"]

    valid_admin_draft = client.post("/api/v1/admin/courses", headers=admin_headers, json={
        "title": "Free draft", "instructor_id": instructor_id, "status": "draft",
        "access_type": "free", "price": 500,
    })
    assert valid_admin_draft.status_code == 201
    assert valid_admin_draft.get_json()["course"]["price"] == 0

    valid_instructor_draft = client.post("/api/v1/instructor/courses", headers=instructor_headers, json={
        "title": "Instructor free draft", "status": "draft", "access_type": "free", "price": 500,
    })
    assert valid_instructor_draft.status_code == 201
    assert valid_instructor_draft.get_json()["course"]["price"] == 0


def test_course_entitlement_uses_course_audience_before_standalone_video_audience(catalog_app):
    with catalog_app.app_context():
        category = Category(name="Equine", slug="equine-entitlement")
        instructor = User(name="Instructor", email="instructor-entitlement@test", password_hash="hash", role="instructor")
        baytarian = User(name="Baytarian", email="baytarian-entitlement@test", password_hash="hash", is_baytarian=True)
        db.session.add_all([category, instructor, baytarian])
        db.session.flush()
        course = Course(
            title="Baytarian course", slug="baytarian-entitlement", instructor_id=instructor.id,
            category_id=category.id, price=100, access_type="baytarian", status="published",
        )
        db.session.add(course)
        db.session.flush()
        video = Lesson(title="Reusable video", access_type="general", price=100, status="published")
        db.session.add(video)
        db.session.flush()
        db.session.add_all([
            CourseVideo(course_id=course.id, video_id=video.id),
            Enrollment(user_id=baytarian.id, course_id=course.id, source="purchase"),
        ])
        db.session.commit()

        assert video_access(baytarian, video) == (True, None)


def test_associated_videos_fall_back_to_their_own_access_type_without_course_grants(catalog_app):
    with catalog_app.app_context():
        category = Category(name="Equine", slug="equine-video-fallback")
        instructor = User(name="Instructor", email="instructor-video-fallback@test", password_hash="hash", role="instructor")
        student = User(name="Student", email="student-video-fallback@test", password_hash="hash")
        baytarian = User(name="Baytarian", email="baytarian-video-fallback@test", password_hash="hash", is_baytarian=True)
        db.session.add_all([category, instructor, student, baytarian])
        db.session.flush()
        course = Course(
            title="Associated course", slug="associated-video-fallback", instructor_id=instructor.id,
            category_id=category.id, price=100, access_type="general", status="published",
        )
        db.session.add(course)
        db.session.flush()
        free_video = Lesson(title="Free", access_type="free", status="published")
        vet_free_video = Lesson(title="Vet free", access_type="vet_free", status="published")
        paid_video = Lesson(title="Paid", access_type="general", price=100, status="published")
        db.session.add_all([free_video, vet_free_video, paid_video])
        db.session.flush()
        db.session.add_all([
            CourseVideo(course_id=course.id, video_id=free_video.id),
            CourseVideo(course_id=course.id, video_id=vet_free_video.id),
            CourseVideo(course_id=course.id, video_id=paid_video.id),
        ])
        db.session.commit()

        assert video_access(student, free_video) == (True, None)
        assert video_access(baytarian, vet_free_video) == (True, None)
        assert video_access(student, vet_free_video) == (False, "needs_baytarian")
        assert video_access(student, paid_video) == (False, "not_entitled")


def test_reusable_video_progress_and_completion_are_scoped_to_each_course(catalog_app):
    with catalog_app.app_context():
        category = Category(name="Equine", slug="equine-progress")
        instructor = User(name="Instructor", email="instructor-progress@example.test", password_hash=hash_password("secret12"), role="instructor")
        student = User(name="Student", email="student-progress@example.test", password_hash=hash_password("secret12"))
        db.session.add_all([category, instructor, student])
        db.session.flush()
        first = Course(title="First", slug="first-progress", instructor_id=instructor.id, category_id=category.id, access_type="free", status="published")
        second = Course(title="Second", slug="second-progress", instructor_id=instructor.id, category_id=category.id, access_type="free", status="published")
        db.session.add_all([first, second])
        db.session.flush()
        video = Lesson(title="Reusable", access_type="general", price=100)
        legacy = Lesson(course_id=first.id, title="Legacy", access_type="general", price=100)
        db.session.add_all([video, legacy])
        db.session.flush()
        db.session.add_all([
            CourseVideo(course_id=first.id, video_id=video.id),
            CourseVideo(course_id=second.id, video_id=video.id),
            CourseVideo(course_id=first.id, video_id=legacy.id),
            Enrollment(user_id=student.id, course_id=first.id, source="free"),
            Enrollment(user_id=student.id, course_id=second.id, source="free"),
        ])
        db.session.commit()
        student_id, first_id, second_id, video_id, legacy_id = student.id, first.id, second.id, video.id, legacy.id

    client = catalog_app.test_client()
    headers = _headers(client, "student-progress@example.test")
    first_progress = client.post("/api/v1/progress", headers=headers, json={
        "lesson_id": video_id, "course_id": first_id, "completed": True,
    })
    assert first_progress.status_code == 200
    assert first_progress.get_json()["progress"] == {"percent": 50, "completed_lessons": 1, "total_lessons": 2}

    second_progress = client.post("/api/v1/progress", headers=headers, json={
        "lesson_id": video_id, "course_id": second_id, "completed": True,
    })
    assert second_progress.status_code == 200
    assert second_progress.get_json()["progress"] == {"percent": 100, "completed_lessons": 1, "total_lessons": 1}

    legacy_progress = client.post("/api/v1/progress", headers=headers, json={
        "lesson_id": legacy_id, "course_id": first_id, "completed": True,
    })
    assert legacy_progress.status_code == 200
    assert legacy_progress.get_json()["progress"] == {"percent": 100, "completed_lessons": 2, "total_lessons": 2}

    with catalog_app.app_context():
        first_enrollment = Enrollment.query.filter_by(user_id=student_id, course_id=first_id).one()
        second_enrollment = Enrollment.query.filter_by(user_id=student_id, course_id=second_id).one()
        assert first_enrollment.completion() == (100, 2, 2)
        assert second_enrollment.completion() == (100, 1, 1)


def test_video_serializer_includes_commerce_and_assignment_metadata(catalog_app):
    with catalog_app.app_context():
        category = Category(name="Equine", name_en="Equine", slug="equine-serialized")
        instructor = User(name="Instructor", email="instructor-serialized@test", password_hash="hash", role="instructor")
        db.session.add_all([category, instructor])
        db.session.flush()
        course = Course(title="Course", slug="course-serialized", instructor_id=instructor.id, category_id=category.id)
        video = Lesson(
            title="Video", title_en="Video", category_id=category.id,
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


def test_canonical_video_schema_has_no_untyped_criteria_column():
    assert "criteria" not in Lesson.__table__.c


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
            assert "criteria" not in {
                row[1] for row in db.session.execute(text("PRAGMA table_info(lessons)"))
            }
            assert db.session.execute(text(
                "SELECT COUNT(*) FROM course_videos WHERE course_id = 1"
            )).scalar_one() == 2


if __name__ == "__main__":
    demo()
