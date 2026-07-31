"""Reusable catalog schema self-check.

Run with ``python -m tests.test_catalog_access``. The tests package supplies a
fresh temporary SQLite database, and this module upgrades it to the migration
head before exercising the schema.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
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


MIGRATIONS_DIR = str(Path(__file__).resolve().parents[1] / "migrations")
PRE_CATALOG_REVISION = "49ad88f02a93"
pytestmark = pytest.mark.filterwarnings("ignore:.*get_engine.*:DeprecationWarning")


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
