import click

from .extensions import db
from .models import User, Category
from .models.catalog import FIXED_CATEGORIES
from .security import hash_password


PROTECTED_CLEANUP_TABLES = {"users", "settings", "categories"}
CLEANUP_CONFIRMATION = "REMOVE-ALL-BUSINESS-DATA"


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
