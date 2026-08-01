import click
from sqlalchemy import func

from .extensions import db
from .models import (
    Article,
    BaytarianRequest,
    Category,
    Course,
    Enrollment,
    InstapayPayment,
    LessonProgress,
    Notification,
    Payment,
    User,
    UserDevice,
    VideoEntitlement,
)
from .models.catalog import FIXED_CATEGORIES
from .security import hash_password


PROTECTED_CLEANUP_TABLES = {"users", "settings", "categories"}
CLEANUP_CONFIRMATION = "REMOVE-ALL-BUSINESS-DATA"
RETAIN_USERS_CONFIRMATION = "RETAIN-ONLY-NAMED-USERS"


def _ensure_fixed_categories():
    added = 0
    for sort_order, (slug, name, name_en) in enumerate(FIXED_CATEGORIES):
        category = Category.query.filter_by(slug=slug).first()
        if category is None:
            category = Category(name=name, name_en=name_en, slug=slug)
            db.session.add(category)
            added += 1
        category.sort_order = sort_order
        category.is_fixed = True
    return added


def register_cli(app):
    @app.cli.command("seed-categories")
    def seed_categories():
        """Seed the six fixed catalog categories without changing edited labels."""
        added = _ensure_fixed_categories()
        db.session.commit()
        click.echo(f"Seeded {added} categories ({len(FIXED_CATEGORIES) - added} already present).")

    @app.cli.command("cleanup-business-data")
    @click.option("--confirm", required=True, help="Required destructive-operation confirmation phrase.")
    def cleanup_business_data(confirm):
        """Delete business data while preserving users, settings, and fixed taxonomy."""
        if confirm != CLEANUP_CONFIRMATION:
            raise click.ClickException(f"Refusing cleanup: use --confirm {CLEANUP_CONFIRMATION}")

        deleted = {}
        try:
            for table in reversed(db.metadata.sorted_tables):
                if table.name in PROTECTED_CLEANUP_TABLES:
                    continue
                result = db.session.execute(table.delete())
                deleted[table.name] = max(result.rowcount or 0, 0)

            fixed_slugs = [slug for slug, _name, _name_en in FIXED_CATEGORIES]
            deleted["custom_categories"] = Category.query.filter(
                ~Category.slug.in_(fixed_slugs)
            ).delete(synchronize_session=False)
            _ensure_fixed_categories()
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        click.echo(
            f"Cleanup complete: removed {sum(deleted.values())} rows; "
            f"preserved {User.query.count()} users and the settings table; "
            f"restored {len(FIXED_CATEGORIES)} fixed categories."
        )

    @app.cli.command("retain-users")
    @click.option("--admin", "admin_email", required=True)
    @click.option("--instructor", "instructor_email", required=True)
    @click.option("--confirm", required=True, help="Required destructive-operation confirmation phrase.")
    def retain_users(admin_email, instructor_email, confirm):
        """Retain two named accounts and remove all other user identities."""
        if confirm != RETAIN_USERS_CONFIRMATION:
            raise click.ClickException(
                f"Refusing cleanup: use --confirm {RETAIN_USERS_CONFIRMATION}"
            )

        requested = [admin_email.strip().lower(), instructor_email.strip().lower()]
        if not all(requested) or requested[0] == requested[1]:
            raise click.ClickException("Admin and instructor must be two different accounts.")

        resolved = []
        for email in requested:
            matches = User.query.filter(func.lower(User.email) == email).all()
            if len(matches) != 1:
                raise click.ClickException(
                    f"Expected exactly one account for {email}; found {len(matches)}."
                )
            resolved.append(matches[0])

        admin_user, instructor_user = resolved
        retained_ids = [admin_user.id, instructor_user.id]
        removed_ids = [
            user_id for (user_id,) in db.session.query(User.id).filter(
                ~User.id.in_(retained_ids)
            ).all()
        ]

        try:
            admin_user.role = "admin"
            admin_user.is_active = True
            instructor_user.role = "instructor"
            instructor_user.is_active = True

            if removed_ids:
                Course.query.filter(Course.instructor_id.in_(removed_ids)).update(
                    {Course.instructor_id: instructor_user.id}, synchronize_session=False
                )
                Article.query.filter(Article.author_id.in_(removed_ids)).update(
                    {Article.author_id: None}, synchronize_session=False
                )
                BaytarianRequest.query.filter(
                    BaytarianRequest.reviewed_by.in_(removed_ids)
                ).update({BaytarianRequest.reviewed_by: None}, synchronize_session=False)
                InstapayPayment.query.filter(
                    InstapayPayment.reviewed_by.in_(removed_ids)
                ).update({InstapayPayment.reviewed_by: None}, synchronize_session=False)

                removed_enrollments = db.session.query(Enrollment.id).filter(
                    Enrollment.user_id.in_(removed_ids)
                )
                LessonProgress.query.filter(
                    LessonProgress.enrollment_id.in_(removed_enrollments)
                ).delete(synchronize_session=False)

                for model in (
                    Payment,
                    InstapayPayment,
                    Enrollment,
                    VideoEntitlement,
                    Notification,
                    BaytarianRequest,
                    UserDevice,
                ):
                    model.query.filter(model.user_id.in_(removed_ids)).delete(
                        synchronize_session=False
                    )
                User.query.filter(User.id.in_(removed_ids)).delete(synchronize_session=False)

            db.session.flush()
            if User.query.count() != 2:
                raise RuntimeError("Retention invariant failed: expected exactly two users.")
            db.session.commit()
        except Exception as exc:
            db.session.rollback()
            raise click.ClickException(f"Retention failed: {exc}") from exc

        click.echo(
            f"Retention complete: kept {admin_user.email} as admin and "
            f"{instructor_user.email} as instructor; removed {len(removed_ids)} users."
        )

    @app.cli.command("create-admin")
    @click.argument("email")
    @click.argument("password")
    @click.argument("name", default="Admin")
    def create_admin(email, password, name):
        """Create a new admin, or promote an existing user to admin."""
        email = email.lower()
        user = User.query.filter_by(email=email).first()
        if user:
            user.role = "admin"
            action = "promoted to admin"
        else:
            user = User(name=name, email=email, password_hash=hash_password(password), role="admin")
            db.session.add(user)
            action = "created as admin"
        db.session.commit()
        click.echo(f"{email} {action}.")
