"""Reusable catalog schema self-check.

Run with ``python -m tests.test_catalog_access``. The tests package supplies a
fresh temporary SQLite database, and this module upgrades it to the migration
head before exercising the schema.
"""
from datetime import datetime, timedelta, timezone
from pathlib import Path
import uuid

from app import create_app
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
from sqlalchemy.exc import IntegrityError


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]

    with app.app_context():
        upgrade(directory=str(Path(__file__).resolve().parents[1] / "migrations"))
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


if __name__ == "__main__":
    demo()
