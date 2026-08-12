import os
from datetime import timedelta


class BaseConfig:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret")
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", SECRET_KEY)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", "postgresql://baytara:baytara@localhost:5432/baytara"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    CORS_ORIGINS = [
        o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()
    ]
    # InstaPay receipt uploads
    INSTAPAY_IMAGE_DIR = os.environ.get("INSTAPAY_IMAGE_DIR", "./instapay_image")
    # Baytarian verification documents (PDF/images)
    BAYTARIAN_DOC_DIR = os.environ.get("BAYTARIAN_DOC_DIR", "./baytarian_docs")
    # Public images uploaded from the Admin Portal (instructor photos, course covers)
    UPLOAD_IMAGE_DIR = os.environ.get("UPLOAD_IMAGE_DIR", "./uploads")
    # Self-hosted video: encrypted HLS packaged onto this machine (docs/SELF_HOSTED_VIDEO.md)
    LOCAL_VIDEO_DIR = os.environ.get("LOCAL_VIDEO_DIR", "./videos")
    # Video uploads need room; nginx caps the public request separately.
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_UPLOAD_MB", "4096")) * 1024 * 1024
    # Public site origin — used to build Fawaterak redirect + webhook URLs
    SITE_URL = os.environ.get("SITE_URL", "https://baytara.app")


class DevelopmentConfig(BaseConfig):
    DEBUG = True


class ProductionConfig(BaseConfig):
    DEBUG = False


def get_config():
    return ProductionConfig if os.environ.get("FLASK_ENV") == "production" else DevelopmentConfig
