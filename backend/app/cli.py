import click

from .extensions import db
from .models import User
from .security import hash_password


def register_cli(app):
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
