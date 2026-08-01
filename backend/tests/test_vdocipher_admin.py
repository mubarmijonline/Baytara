"""VdoCipher Admin management tests using only fake provider responses."""
import io
import json
import urllib.error

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Lesson, User
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


def test_normalize_video_converts_provider_unix_upload_time():
    raw = {"id": "v1", "title": "Exam", "description": "Details", "upload_time": 1704067200}
    assert va.normalize_video(raw)["uploaded_at"] == "2024-01-01T00:00:00Z"


@pytest.mark.parametrize(("field", "value"), [
    ("title", 7),
    ("description", []),
    ("poster", {}),
    ("posters", None),
    ("posters", 7),
    ("posters", [None]),
    ("posters", [{"posterUrl": 7}]),
    ("thumbUrl", []),
    ("status", 3),
    ("uploaded_at", {}),
    ("upload_time", []),
    ("upload_time", True),
    ("upload_time", float("inf")),
    ("length", True),
    ("length", "90"),
    ("length", float("nan")),
    ("length", float("inf")),
])
def test_normalize_video_rejects_malformed_admin_fields(field, value):
    raw = {"id": "v1", "title": "Exam", "description": "Details", "length": 90}
    raw[field] = value
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        va.normalize_video(raw)


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
        ("POST", "/videos/move-videos-and-folders", {"folderId": "folder-2", "videos": ["v1"], "folders": ["folder-1"]}, None),
        ("DELETE", "/videos/folders/folder-1", None, None),
        ("GET", "/videos/v1", None, None),
        ("POST", "/videos/v1", {"title": "Updated", "description": "Description"}, None),
        ("POST", "/videos/v1/otp", {"ttl": 300}, None),
    ]


def test_client_preview_rejects_non_object_provider_response(monkeypatch):
    provider = va.VdoCipherAdminClient()
    monkeypatch.setattr(provider, "_request", lambda *args, **kwargs: [])
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        provider.preview("v1")


def test_move_requires_typed_id_arrays():
    provider = va.VdoCipherAdminClient()
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_invalid_video$"):
        provider.move_items("root", "v1", [])
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_invalid_folder$"):
        provider.move_items("root", ["v1"], "folder-1")


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


@pytest.mark.parametrize("response", [[], None, "not an object"])
def test_service_rejects_malformed_provider_response_shapes(monkeypatch, response):
    cases = [
        ("list_videos", lambda: va.list_videos(refresh=True)),
        ("list_folder", lambda: va.list_folder("root", refresh=True)),
        ("create_folder", lambda: va.create_folder("Child", "root")),
        ("get_video", lambda: va.get_video("v1")),
        ("update_video", lambda: va.update_video("v1", "Title", "Description")),
        ("preview", lambda: va.preview("v1")),
    ]
    for method, call in cases:
        fake = type("MalformedProvider", (), {method: lambda self, *args, **kwargs: response})()
        monkeypatch.setattr(va, "client", fake)
        va.clear_cache()
        with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
            call()


def test_upload_rejects_malformed_provider_payload_and_id(monkeypatch):
    for response in ([], None, "not an object", {"videoId": "bad.id", "clientPayload": {"uploadLink": "https://upload.test"}}):
        fake = type("MalformedUploadProvider", (), {"create_upload": lambda self, *args, **kwargs: response})()
        monkeypatch.setattr(va, "client", fake)
        with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
            va.create_upload("Title", "root")


def test_service_rejects_provider_objects_missing_required_fields(monkeypatch):
    cases = [
        ("list_videos", {}, lambda: va.list_videos(refresh=True)),
        ("list_folder", {}, lambda: va.list_folder("root", refresh=True)),
        ("create_folder", {}, lambda: va.create_folder("Child", "root")),
        ("get_video", {}, lambda: va.get_video("v1")),
        ("update_video", {}, lambda: va.update_video("v1", "Title", "Description")),
        ("preview", {"otp": "otp"}, lambda: va.preview("v1")),
    ]
    for method, response, call in cases:
        fake = type("WrongShapeProvider", (), {method: lambda self, *args, **kwargs: response})()
        monkeypatch.setattr(va, "client", fake)
        va.clear_cache()
        with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
            call()


def test_provider_video_id_must_be_safe():
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        va.normalize_video({"id": "bad.id"})


@pytest.mark.parametrize("folder", [
    {"id": "bad.id", "name": "Child", "parent": "root"},
    {"id": "child", "name": "Child", "parent": "bad.id"},
])
def test_list_folder_rejects_malformed_child_identifiers(monkeypatch, folder):
    fake = type("MalformedFolderProvider", (), {
        "list_folder": lambda self, *args: {
            "folderList": [folder], "current": {"id": "root", "parent": None}, "parent": None,
        },
    })()
    monkeypatch.setattr(va, "client", fake)

    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        va.list_folder("root", refresh=True)


@pytest.mark.parametrize("response", [
    {"folderList": [], "current": {"id": "bad.id", "parent": None}, "parent": None},
    {"folderList": [], "current": {"id": "root", "parent": "bad.id"}, "parent": None},
    {"folderList": [], "current": {"id": "child", "parent": "root"},
     "parent": {"id": "bad.id", "parent": None}},
    {"folderList": [], "current": {"id": "child", "parent": "root"},
     "parent": {"id": "root", "parent": "bad.id"}},
])
def test_list_folder_rejects_malformed_current_and_parent_identifiers(monkeypatch, response):
    fake = type("MalformedFolderProvider", (), {"list_folder": lambda self, *args: response})()
    monkeypatch.setattr(va, "client", fake)

    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        va.list_folder("root", refresh=True)


def test_list_folder_normalizes_root_and_null_parent_values(monkeypatch):
    response = {
        "folderList": [{
            "id": "child", "name": "Child", "parent": "root", "ignored": "value",
            "folderPath": [{"id": "root", "name": "Library"}, {"id": "child", "name": "Child"}],
        }],
        "current": {"id": "root", "name": "Library", "parent": None, "ignored": "value"},
        "parent": None,
    }
    fake = type("FolderProvider", (), {"list_folder": lambda self, *args: response})()
    monkeypatch.setattr(va, "client", fake)

    assert va.list_folder("root", refresh=True) == {
        "folders": [{
            "id": "child", "name": "Child", "parent": "root",
            "folderPath": [{"id": "root", "name": "Library"}, {"id": "child", "name": "Child"}],
        }],
        "current": {"id": "root", "name": "Library", "parent": None},
        "parent": None,
    }


@pytest.mark.parametrize("folder", [
    {"id": "bad.id", "name": "Course", "parent": "root"},
    {"id": "course", "name": "Course", "parent": "bad.id"},
    {"id": "course", "name": "Course", "parent": "root", "folderPath": [{"id": "bad.id"}]},
])
def test_ensure_folder_rejects_malformed_search_identifiers(monkeypatch, folder):
    calls = []

    class SearchProvider:
        def search_folders(self, name):
            return {"folders": [folder]}

        def create_folder(self, name, parent):
            calls.append((name, parent))
            return {"id": "created", "name": name, "parent": parent}

    monkeypatch.setattr(va, "client", SearchProvider())
    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        va.ensure_folder("Course")
    assert calls == []


def test_ensure_folder_accepts_root_and_null_parent_search_results(monkeypatch):
    fake = type("SearchProvider", (), {
        "search_folders": lambda self, name: {
            "folders": [{
                "id": "course", "name": name, "parent": None,
                "folderPath": [{"id": "root", "name": "Library"}, {"id": "course", "name": name}],
            }],
        },
    })()
    monkeypatch.setattr(va, "client", fake)

    assert va.ensure_folder("Course") == "course"


@pytest.mark.parametrize("response", [
    {"id": "bad.id", "name": "Child", "parent": "root"},
    {"id": "child", "name": "Child", "parent": "bad.id"},
])
def test_create_folder_rejects_malformed_provider_identifiers(monkeypatch, response):
    fake = type("CreateProvider", (), {"create_folder": lambda self, *args: response})()
    monkeypatch.setattr(va, "client", fake)

    with pytest.raises(va.VdoCipherAdminError, match="^vdocipher_bad_response$"):
        va.create_folder("Child", "root")


def test_create_folder_normalizes_provider_response(monkeypatch):
    fake = type("CreateProvider", (), {
        "create_folder": lambda self, *args: {"id": "child", "name": "Child", "parent": None, "secret": "drop"},
    })()
    monkeypatch.setattr(va, "client", fake)

    assert va.create_folder("Child", "root") == {"id": "child", "name": "Child", "parent": None}


class FakeProvider:
    def __init__(self):
        self.calls = []

    def list_videos(self, **params):
        self.calls.append(("list_videos", params))
        return {"count": 1, "rows": [{"id": "v1", "title": "Exam", "description": "Details",
                                         "posters": [{"posterUrl": "https://img/p.jpg"}], "length": 90}]}

    def list_folder(self, folder_id):
        self.calls.append(("list_folder", folder_id))
        return {
            "folderList": [{"id": "child", "name": "Child", "parent": folder_id}],
            "current": {"id": folder_id, "parent": None},
            "parent": None,
        }

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
    assert folder.get_json()["folders"] == [{"id": "child", "name": "Child", "parent": "root"}]
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

    bad_video = admin_client.get("/api/v1/admin/vdocipher/videos/bad.id")
    assert bad_video.status_code == 422
    assert bad_video.get_json() == {"error": "vdocipher_invalid_video"}
    bad_move = admin_client.post("/api/v1/admin/vdocipher/move", json={
        "folder_id": "root", "video_ids": ["bad.id"], "folder_ids": [],
    })
    assert bad_move.status_code == 422
    assert bad_move.get_json() == {"error": "vdocipher_invalid_video"}
    bad_import = admin_client.post("/api/v1/admin/vdocipher/import", json={"video_id": "bad.id"})
    assert bad_import.status_code == 422
    assert bad_import.get_json() == {"error": "vdocipher_invalid_video"}
    with admin_client.application.app_context():
        assert Lesson.query.filter_by(vdocipher_video_id="bad.id").count() == 0

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
