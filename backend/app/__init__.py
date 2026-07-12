from flask import Flask
from flask_cors import CORS
from dotenv import load_dotenv

from .config import get_config
from .extensions import db, migrate, jwt

load_dotenv()


def create_app(config=None):
    app = Flask(__name__)
    app.config.from_object(config or get_config())

    db.init_app(app)
    migrate.init_app(app, db)
    jwt.init_app(app)

    from . import models  # noqa: F401 — register models on db.metadata for Alembic
    from .cli import register_cli
    register_cli(app)
    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    from .api.v1.health import bp as health_bp
    from .api.v1.auth import bp as auth_bp
    from .api.v1.courses import bp as courses_bp
    from .api.v1.learning import bp as learning_bp
    from .api.v1.payment import bp as payment_bp
    from .api.v1.admin import bp as admin_bp
    from .api.v1.content import bp as content_bp
    app.register_blueprint(health_bp, url_prefix="/api/v1")
    app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    app.register_blueprint(courses_bp, url_prefix="/api/v1")
    app.register_blueprint(learning_bp, url_prefix="/api/v1")
    app.register_blueprint(payment_bp, url_prefix="/api/v1")
    app.register_blueprint(content_bp, url_prefix="/api/v1")
    app.register_blueprint(admin_bp, url_prefix="/api/v1/admin")

    return app
