from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, Lesson, Setting, User
from app.models.catalog import FIXED_CATEGORIES
from app.security import hash_password


def make_app(tmp_path):
    config = type("CliConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'cli.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
    return app


def test_seed_categories_uses_fixed_taxonomy_idempotently(tmp_path):
    app = make_app(tmp_path)
    runner = app.test_cli_runner()

    assert runner.invoke(args=["seed-categories"]).exit_code == 0
    assert runner.invoke(args=["seed-categories"]).exit_code == 0

    with app.app_context():
        rows = Category.query.order_by(Category.sort_order).all()
        assert [(row.slug, row.name, row.name_en, row.is_fixed) for row in rows] == [
            (slug, name, name_en, True) for slug, name, name_en in FIXED_CATEGORIES
        ]


def test_cleanup_business_data_requires_confirmation_and_preserves_users_settings(tmp_path):
    app = make_app(tmp_path)
    with app.app_context():
        instructor = User(
            name="Instructor", email="instructor@example.test",
            password_hash=hash_password("secret12"), role="instructor",
        )
        db.session.add_all([
            instructor,
            Setting(key="secret_vdocipher", value="provider-secret"),
            Category(name="Test", name_en="Test", slug="test-category"),
        ])
        db.session.flush()
        course = Course(title="Test course", slug="test-course", instructor_id=instructor.id)
        db.session.add(course)
        db.session.flush()
        db.session.add(Lesson(title="Test video", course_id=course.id))
        db.session.commit()

    runner = app.test_cli_runner()
    refused = runner.invoke(args=["cleanup-business-data", "--confirm", "wrong"])
    assert refused.exit_code != 0

    result = runner.invoke(args=[
        "cleanup-business-data", "--confirm", "REMOVE-ALL-BUSINESS-DATA",
    ])
    assert result.exit_code == 0, result.output

    with app.app_context():
        assert User.query.count() == 1
        assert db.session.get(Setting, "secret_vdocipher").value == "provider-secret"
        assert Course.query.count() == 0
        assert Lesson.query.count() == 0
        categories = Category.query.order_by(Category.sort_order).all()
        assert [category.slug for category in categories] == [row[0] for row in FIXED_CATEGORIES]
        assert all(category.is_fixed for category in categories)
