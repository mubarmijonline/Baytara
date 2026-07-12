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
    CORS(app, origins=app.config["CORS_ORIGINS"], supports_credentials=True)

    from .api.v1.health import bp as health_bp
    app.register_blueprint(health_bp, url_prefix="/api/v1")

    return app
