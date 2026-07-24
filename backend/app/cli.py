import click

from .extensions import db
from .models import User, Category
from .security import hash_password
from .utils import slugify

# Default animal categories (client البند3 revision). Admin can add more.
SEED_CATEGORIES = [
    ("الحيوانات الكبيرة (أبقار وأغنام)", "Large Animals (Cattle & Sheep)"),
    ("الخيول", "Equine"),
    ("الحيوانات الأليفة", "Pet Animals"),
    ("الدواجن والطيور", "Poultry & Birds"),
    ("الأسماك", "Fish"),
    ("الجمال", "Camels"),
]


def register_cli(app):
    @app.cli.command("seed-categories")
    def seed_categories():
        """Seed the default animal categories (idempotent, matched by English name)."""
        added = 0
        for name_ar, name_en in SEED_CATEGORIES:
            if Category.query.filter(db.or_(Category.name == name_ar, Category.name_en == name_en)).first():
                continue
            db.session.add(Category(
                name=name_ar, name_en=name_en,
                slug=slugify(name_en, lambda s: Category.query.filter_by(slug=s).first() is not None)))
            added += 1
        db.session.commit()
        click.echo(f"Seeded {added} categories ({len(SEED_CATEGORIES) - added} already present).")

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
