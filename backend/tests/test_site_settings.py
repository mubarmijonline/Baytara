"""Bilingual site-settings API contract coverage."""

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Setting, User
from app.security import hash_password


@pytest.fixture
def app(tmp_path):
    config = type("SiteSettingsConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'site-settings.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def admin_client(app):
    with app.app_context():
        db.session.add(User(
            name="Admin",
            email="site-settings-admin@example.test",
            password_hash=hash_password("secret12"),
            role="admin",
        ))
        db.session.commit()
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "site-settings-admin@example.test",
        "password": "secret12",
    })
    client.environ_base["HTTP_AUTHORIZATION"] = (
        f"Bearer {login.get_json()['access_token']}"
    )
    return client


def test_public_settings_merge_defaults_localize_and_hide_secrets(client, app):
    with app.app_context():
        db.session.add_all([
            Setting(key="hero", value={"title": {"ar": "عنوان", "en": "Title"}}),
            Setting(key="secret_vdocipher", value="never-public"),
        ])
        db.session.commit()

    settings = client.get("/api/v1/settings?lang=en").get_json()["settings"]

    assert settings["hero"]["title"] == "Title"
    assert settings["hero"]["subtitle"]
    assert "secret_vdocipher" not in settings


def test_public_settings_support_legacy_strings_and_unrelated_values(client, app):
    with app.app_context():
        db.session.add_all([
            Setting(key="hero", value={"title": "عنوان قديم"}),
            Setting(key="renewal_percent", value=35),
        ])
        db.session.commit()

    settings = client.get("/api/v1/settings?lang=en").get_json()["settings"]

    assert settings["hero"]["title"] == "عنوان قديم"
    assert settings["renewal_percent"] == 35


def test_admin_settings_return_bilingual_defaults(admin_client):
    settings = admin_client.get("/api/v1/admin/settings").get_json()["settings"]

    assert set(settings["hero"]["title"]) == {"ar", "en"}
    assert settings["header"]["brand"]["en"]
    assert settings["footer"]["tagline"]["ar"]


def test_admin_settings_reject_malformed_localized_values(admin_client):
    response = admin_client.put("/api/v1/admin/settings", json={
        "hero": {"title": {"ar": [], "en": "Title"}},
    })

    assert response.status_code == 422
    assert "invalid_hero_title_ar" in response.get_json()["errors"]


def test_admin_settings_preserve_blank_secrets(admin_client, app):
    with app.app_context():
        db.session.add(Setting(key="secret_vdocipher_api_key", value="saved-key"))
        db.session.commit()

    response = admin_client.put("/api/v1/admin/settings", json={
        "secret_vdocipher_api_key": "",
        "contact": {"email": "hello@baytara.app"},
    })

    assert response.status_code == 200
    with app.app_context():
        assert db.session.get(Setting, "secret_vdocipher_api_key").value == "saved-key"


def test_admin_settings_reject_malformed_repeated_records(admin_client):
    response = admin_client.put("/api/v1/admin/settings", json={
        "testimonials": [{"quote": {"ar": "ممتاز", "en": 12}}],
    })

    assert response.status_code == 422
    assert "invalid_testimonials_0_quote_en" in response.get_json()["errors"]
