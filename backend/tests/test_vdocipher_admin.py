"""VdoCipher Admin management tests using only fake provider responses."""
import io
import json
import urllib.error

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import User
from app.security import hash_password
from app.services import vdocipher_admin as va


@pytest.fixture
def app(tmp_path):
    config = type("VdoCipherAdminConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'vdocipher-admin.sqlite'}",
        "TESTING": True,
    })
    application = create_app(config)
    with application.app_context():
        db.create_all()
        yield application
        db.session.remove()
        db.drop_all()


@pytest.fixture
def admin_client(app):
    with app.app_context():
        db.session.add(User(name="Admin", email="vdocipher-admin@example.test",
                            password_hash=hash_password("secret12"), role="admin"))
        db.session.commit()
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "vdocipher-admin@example.test", "password": "secret12",
    })
    assert login.status_code == 200
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    return client


def test_normalize_video_prefers_poster_and_keeps_description():
    raw = {"id": "v1", "title": "Exam", "description": "Details",
           "poster": "https://img/p.jpg", "length": 90}
    assert va.normalize_video(raw) == {
        "id": "v1", "title": "Exam", "description": "Details",
        "poster": "https://img/p.jpg", "duration_seconds": 90,
        "status": None, "uploaded_at": None,
    }


def test_client_uses_approved_provider_methods_paths_and_payloads(monkeypatch):
    provider = va.VdoCipherAdminClient()
    calls = []

    def request(method, path, body=None, params=None):
        calls.append((method, path, body, params))
        if path.endswith("/otp"):
            return {"otp": "otp", "playbackInfo": "playback"}
        return {"id": "v1"}

    monkeypatch.setattr(provider, "_request", request)
    provider.list_videos(q="exam", folderId="folder-1", page=2, limit=20)
    provider.list_folder("folder-1")
    provider.create_folder("Child", "folder-1")
    provider.rename_folder("folder-1", "Renamed")
    provider.move_items("folder-2", ["v1"], ["folder-1"])
    provider.delete_folder("folder-1")
    provider.get_video("v1")
    provider.update_video("v1", "Updated", "Description")
    assert provider.preview("v1") == {"otp": "otp", "playbackInfo": "playback"}

    assert calls == [
        ("GET", "/videos", None, {"q": "exam", "folderId": "folder-1", "page": 2, "limit": 20}),
        ("GET", "/videos/folders/folder-1", None, None),
        ("POST", "/videos/folders", {"name": "Child", "parent": "folder-1"}, None),
        ("PUT", "/videos/folders/folder-1", {"name": "Renamed"}, None),
        ("POST", "/videos/folders/folder-2/move", {"videos": ["v1"], "folders": ["folder-1"]}, None),
        ("DELETE", "/videos/folders/folder-1", None, None),
        ("GET", "/videos/v1", None, None),
        ("POST", "/videos/v1", {"title": "Updated", "description": "Description"}, None),
        ("POST", "/videos/v1/otp", {"ttl": 300}, None),
    ]


@pytest.mark.parametrize(("status", "code"), [
    (404, "vdocipher_not_found"),
    (429, "vdocipher_rate_limited"),
    (500, "vdocipher_unreachable"),
])
def test_request_maps_provider_errors_without_leaking_bodies(monkeypatch, status, code):
    provider = va.VdoCipherAdminClient()
    monkeypatch.setattr(va, "_secret", lambda: "server-secret")

    def raise_http(*args, **kwargs):
        raise urllib.error.HTTPError("https://provider.test", status, "provider body", {}, io.BytesIO())

    monkeypatch.setattr(va.urllib.request, "urlopen", raise_http)
    with pytest.raises(va.VdoCipherAdminError, match=f"^{code}$"):
        provider._request("GET", "/videos")


def test_request_has_stable_missing_key_and_unreachable_errors(monkeypatch):
    provider = va.VdoCipherAdminClient()
    monkeypatch.setattr(va, "_secret", lambda: None)
    with pytest.raises(va.VdoCipherAdminError, match="^no_api_key$"):
        provider._request("GET", "/videos")

    monkeypatch.setattr(va, "_secret", lambda: "server-secret")
    monkeypatch.setattr(va.urllib.request, "urlopen", lambda *args, **kwargs: (_ for _ in ()).throw(OSError()))
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_unreachable$"):
        provider._request("GET", "/videos")

    class BadResponse:
        def __enter__(self):
            return io.BytesIO(b"not json")

        def __exit__(self, *args):
            return False

    monkeypatch.setattr(va.urllib.request, "urlopen", lambda *args, **kwargs: BadResponse())
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        provider._request("GET", "/videos")


class FakeProvider:
    def __init__(self):
        self.calls = []

    def list_videos(self, **params):
        self.calls.append(("list_videos", params))
        return {"count": 1, "rows": [{"id": "v1", "title": "Exam", "description": "Details",
                                         "posters": [{"posterUrl": "https://img/p.jpg"}], "length": 90}]}

    def list_folder(self, folder_id):
        self.calls.append(("list_folder", folder_id))
        return {"folderList": [{"id": "child", "name": "Child"}], "current": {"id": folder_id}}

    def create_folder(self, name, parent="root"):
        self.calls.append(("create_folder", name, parent))
        return {"id": "created", "name": name, "parent": parent}

    def rename_folder(self, folder_id, name):
        self.calls.append(("rename_folder", folder_id, name))
        return {"message": "Folder has been updated"}

    def move_items(self, folder_id, video_ids, folder_ids):
        self.calls.append(("move_items", folder_id, video_ids, folder_ids))
        return {"message": "Moved"}

    def delete_folder(self, folder_id):
        self.calls.append(("delete_folder", folder_id))
        return {"message": "Folder Deleted"}

    def get_video(self, video_id):
        self.calls.append(("get_video", video_id))
        return {"id": video_id, "title": "Exam", "description": "Details", "length": 90}

    def update_video(self, video_id, title, description):
        self.calls.append(("update_video", video_id, title, description))
        return {"message": "updated"}

    def preview(self, video_id):
        self.calls.append(("preview", video_id))
        return {"otp": "short-lived", "playbackInfo": "playback"}

    def create_upload(self, title, folder_id):
        self.calls.append(("create_upload", title, folder_id))
        return {"videoId": "uploaded", "clientPayload": {"uploadLink": "https://upload.test", "policy": "policy"}}


@pytest.fixture
def provider(monkeypatch):
    fake = FakeProvider()
    monkeypatch.setattr(va, "client", fake)
    va.clear_cache()
    return fake


def test_admin_management_endpoints_normalize_cache_and_invalidate(admin_client, provider):
    listed = admin_client.get("/api/v1/admin/vdocipher/videos?folder_id=folder-1")
    assert listed.status_code == 200
    assert listed.get_json() == {"count": 1, "videos": [{"id": "v1", "title": "Exam", "description": "Details",
                                                             "poster": "https://img/p.jpg", "duration_seconds": 90,
                                                             "status": None, "uploaded_at": None}]}
    assert admin_client.get("/api/v1/admin/vdocipher/videos?folder_id=folder-1").status_code == 200
    assert [call[0] for call in provider.calls].count("list_videos") == 1
    assert admin_client.get("/api/v1/admin/vdocipher/videos?folder_id=folder-1&refresh=1").status_code == 200
    assert [call[0] for call in provider.calls].count("list_videos") == 2

    assert admin_client.get("/api/v1/admin/vdocipher/videos?limit=1").status_code == 200
    assert admin_client.post("/api/v1/admin/vdocipher/test").status_code == 200
    assert [call[0] for call in provider.calls].count("list_videos") == 4

    folder = admin_client.get("/api/v1/admin/vdocipher/folders/root")
    assert folder.status_code == 200
    assert folder.get_json()["folders"] == [{"id": "child", "name": "Child"}]
    assert admin_client.post("/api/v1/admin/vdocipher/folders", json={"name": "New", "parent_id": "root"}).status_code == 201
    assert admin_client.get("/api/v1/admin/vdocipher/folders/root").status_code == 200
    assert [call[0] for call in provider.calls].count("list_folder") == 2

    assert admin_client.patch("/api/v1/admin/vdocipher/folders/child", json={"name": "Renamed"}).status_code == 200
    assert admin_client.post("/api/v1/admin/vdocipher/move", json={
        "folder_id": "root", "video_ids": ["v1"], "folder_ids": ["child"],
    }).status_code == 200
    assert admin_client.delete("/api/v1/admin/vdocipher/folders/child").status_code == 200
    assert admin_client.get("/api/v1/admin/vdocipher/videos/v1").get_json()["video"]["duration_seconds"] == 90
    assert admin_client.patch("/api/v1/admin/vdocipher/videos/v1", json={
        "title": "Updated", "description": "Updated description",
    }).status_code == 200
    preview = admin_client.post("/api/v1/admin/vdocipher/videos/v1/preview")
    assert preview.get_json() == {"otp": "short-lived", "playbackInfo": "playback"}
    assert "secret" not in json.dumps(preview.get_json())


def test_admin_management_endpoints_validate_input_and_map_errors(admin_client, provider, monkeypatch):
    bad_folder = admin_client.get("/api/v1/admin/vdocipher/folders/bad.id")
    assert bad_folder.status_code == 422
    assert bad_folder.get_json()["error"] == "vdocipher_invalid_folder"
    assert admin_client.post("/api/v1/admin/vdocipher/folders", json={"name": ""}).get_json()["error"] == "name_required"
    assert admin_client.post("/api/v1/admin/vdocipher/move", json={"folder_id": "root"}).get_json()["error"] == "move_items_required"
    assert admin_client.patch("/api/v1/admin/vdocipher/videos/v1", json={"title": ""}).get_json()["error"] == "title_required"

    monkeypatch.setattr(va, "list_videos", lambda **kwargs: (_ for _ in ()).throw(va.VdoCipherAdminError("vdocipher_rate_limited")))
    rate_limited = admin_client.get("/api/v1/admin/vdocipher/videos?refresh=1")
    assert rate_limited.status_code == 429
    assert rate_limited.get_json() == {"error": "vdocipher_rate_limited"}


def test_upload_credentials_accepts_explicit_folder_and_returns_only_upload_fields(admin_client, provider):
    response = admin_client.post("/api/v1/admin/vdocipher/upload-credentials", json={
        "title": "New upload", "folder_id": "folder-1",
    })
    assert response.status_code == 200
    assert response.get_json() == {
        "video_id": "uploaded", "upload_link": "https://upload.test", "fields": {"policy": "policy"},
    }
    assert ("create_upload", "New upload", "folder-1") in provider.calls

    invalid = admin_client.post("/api/v1/admin/vdocipher/upload-credentials", json={
        "title": "New upload", "folder_id": "",
    })
    assert invalid.status_code == 422
    assert invalid.get_json() == {"error": "vdocipher_invalid_folder"}
