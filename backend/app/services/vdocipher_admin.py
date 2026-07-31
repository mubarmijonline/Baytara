"""Admin-side VdoCipher library, folder, upload, and preview management."""
import copy
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://dev.vdocipher.com/api"
ROOT_NAME = "Baytara"
STANDALONE_NAME = "Standalone"
CACHE_SECONDS = 30
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,120}$")
_CACHE = {}


class VdoCipherAdminError(Exception):
    pass


def _setting(key):
    try:
        from ..extensions import db
        from ..models import Setting

        setting = db.session.get(Setting, key)
        return setting.value if setting and setting.value else None
    except Exception:  # noqa: BLE001 - usable outside app context in tests/imports
        return None


def _set_setting(key, value):
    from ..extensions import db
    from ..models import Setting

    setting = db.session.get(Setting, key)
    if setting:
        setting.value = value
    else:
        db.session.add(Setting(key=key, value=value))


def _secret():
    return _setting("secret_vdocipher") or os.environ.get("VDOCIPHER_API_SECRET")


def configured():
    return bool(_secret())


def _require_folder_id(folder_id):
    if not isinstance(folder_id, str) or not _ID_RE.fullmatch(folder_id):
        raise VdoCipherAdminError("vdocipher_invalid_folder")
    return folder_id


def _require_video_id(video_id):
    if not isinstance(video_id, str) or not _ID_RE.fullmatch(video_id):
        raise VdoCipherAdminError("vdocipher_bad_response")
    return video_id


def _provider_error(status):
    if status in (401, 403):
        return "no_api_key"
    if status == 404:
        return "vdocipher_not_found"
    if status == 429:
        return "vdocipher_rate_limited"
    return "vdocipher_unreachable"


def _poster(raw):
    if raw.get("poster"):
        return raw["poster"]
    for poster in raw.get("posters") or []:
        if isinstance(poster, dict) and poster.get("posterUrl"):
            return poster["posterUrl"]
    return raw.get("thumbUrl")


def normalize_video(raw):
    if not isinstance(raw, dict) or not raw.get("id"):
        raise VdoCipherAdminError("vdocipher_bad_response")
    return {
        "id": raw["id"],
        "title": raw.get("title") or "",
        "description": raw.get("description") or "",
        "poster": _poster(raw),
        "duration_seconds": raw.get("length", raw.get("duration")),
        "status": raw.get("status"),
        "uploaded_at": raw.get("uploaded_at", raw.get("upload_time")),
    }


def _cache_get(key, refresh):
    if refresh:
        return None
    cached = _CACHE.get(key)
    if cached and cached[0] > time.monotonic():
        return copy.deepcopy(cached[1])
    _CACHE.pop(key, None)
    return None


def _cache_put(key, value):
    _CACHE[key] = (time.monotonic() + CACHE_SECONDS, copy.deepcopy(value))
    return value


def clear_cache():
    _CACHE.clear()


class VdoCipherAdminClient:
    def _request(self, method, path, body=None, params=None):
        secret = _secret()
        if not secret:
            raise VdoCipherAdminError("no_api_key")
        query = urllib.parse.urlencode({key: value for key, value in (params or {}).items()
                                        if value not in (None, "")})
        url = BASE + path + (("?" + query) if query else "")
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Apisecret " + secret)
        req.add_header("Accept", "application/json")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=12) as response:
                try:
                    return json.load(response)
                except (json.JSONDecodeError, UnicodeDecodeError, TypeError, ValueError) as exc:
                    raise VdoCipherAdminError("vdocipher_bad_response") from exc
        except urllib.error.HTTPError as exc:
            raise VdoCipherAdminError(_provider_error(exc.code)) from exc
        except VdoCipherAdminError:
            raise
        except Exception as exc:  # noqa: BLE001 - provider details must not reach clients
            raise VdoCipherAdminError("vdocipher_unreachable") from exc

    def list_videos(self, **params):
        return self._request("GET", "/videos", params=params)

    def list_folder(self, folder_id):
        folder_id = _require_folder_id(folder_id)
        return self._request("GET", f"/videos/folders/{folder_id}")

    def search_folders(self, name):
        return self._request("POST", "/videos/folders/search", body={"name": name, "searchExact": True})

    def create_folder(self, name, parent="root"):
        return self._request("POST", "/videos/folders", body={"name": name, "parent": _require_folder_id(parent)})

    def rename_folder(self, folder_id, name):
        folder_id = _require_folder_id(folder_id)
        return self._request("PUT", f"/videos/folders/{folder_id}", body={"name": name})

    def move_items(self, folder_id, video_ids, folder_ids):
        folder_id = _require_folder_id(folder_id)
        return self._request(
            "POST", f"/videos/folders/{folder_id}/move",
            body={"videos": [_require_video_id(video_id) for video_id in video_ids],
                  "folders": [_require_folder_id(item_id) for item_id in folder_ids]},
        )

    def delete_folder(self, folder_id):
        folder_id = _require_folder_id(folder_id)
        return self._request("DELETE", f"/videos/folders/{folder_id}")

    def get_video(self, video_id):
        video_id = _require_video_id(video_id)
        return self._request("GET", f"/videos/{video_id}")

    def update_video(self, video_id, title, description):
        video_id = _require_video_id(video_id)
        return self._request("POST", f"/videos/{video_id}", body={"title": title, "description": description})

    def preview(self, video_id):
        video_id = _require_video_id(video_id)
        data = self._request("POST", f"/videos/{video_id}/otp", body={"ttl": 300})
        if not data.get("otp") or not data.get("playbackInfo"):
            raise VdoCipherAdminError("vdocipher_bad_response")
        return {"otp": data["otp"], "playbackInfo": data["playbackInfo"]}

    def create_upload(self, title, folder_id):
        return self._request("PUT", "/videos", params={"title": title, "folderId": _require_folder_id(folder_id)})


client = VdoCipherAdminClient()


def _folder_id(row):
    return row.get("id") or row.get("folderId") or row.get("_id")


def list_videos(q=None, folder_id=None, page=1, limit=20, refresh=False):
    if folder_id is not None:
        _require_folder_id(folder_id)
    params = {"q": q, "folderId": folder_id, "page": max(int(page or 1), 1),
              "limit": min(max(int(limit or 20), 1), 40)}
    key = ("videos", tuple(sorted(params.items())))
    cached = _cache_get(key, refresh)
    if cached is not None:
        return cached
    data = client.list_videos(**params)
    rows = data.get("rows") or data.get("videos")
    if not isinstance(rows, list):
        raise VdoCipherAdminError("vdocipher_bad_response")
    return _cache_put(key, {"count": data.get("count", len(rows)), "videos": [normalize_video(row) for row in rows]})


def list_folder(folder_id, refresh=False):
    folder_id = _require_folder_id(folder_id)
    key = ("folder", folder_id)
    cached = _cache_get(key, refresh)
    if cached is not None:
        return cached
    data = client.list_folder(folder_id)
    folders = data.get("folderList", data.get("folders"))
    if not isinstance(folders, list):
        raise VdoCipherAdminError("vdocipher_bad_response")
    return _cache_put(key, {"folders": folders, "current": data.get("current"), "parent": data.get("parent")})


def create_folder(name, parent_id="root"):
    created = client.create_folder(name, parent_id)
    if not _folder_id(created):
        raise VdoCipherAdminError("vdocipher_bad_response")
    clear_cache()
    return created


def rename_folder(folder_id, name):
    result = client.rename_folder(folder_id, name)
    clear_cache()
    return result


def move_items(folder_id, video_ids, folder_ids):
    result = client.move_items(folder_id, video_ids, folder_ids)
    clear_cache()
    return result


def delete_folder(folder_id):
    result = client.delete_folder(folder_id)
    clear_cache()
    return result


def get_video(video_id):
    return normalize_video(client.get_video(video_id))


def update_video(video_id, title, description):
    result = client.update_video(video_id, title, description)
    clear_cache()
    return result


def preview(video_id):
    return client.preview(video_id)


def ensure_folder(name, parent="root"):
    found = client.search_folders(name).get("folders", [])
    for folder in found:
        if folder.get("name") == name and _folder_id(folder):
            return _folder_id(folder)
    created = create_folder(name, parent)
    return _folder_id(created)


def _course_folder_name(course):
    return f"{course.title} - #{course.id}"


def ensure_platform_folders(all_courses=False):
    from ..models import Course

    root = _setting("vdocipher_root_folder_id") or ensure_folder(ROOT_NAME, "root")
    _set_setting("vdocipher_root_folder_id", root)

    standalone = _setting("vdocipher_standalone_folder_id") or ensure_folder(STANDALONE_NAME, root)
    _set_setting("vdocipher_standalone_folder_id", standalone)

    courses = {}
    if all_courses:
        for course in Course.query.order_by(Course.id).all():
            courses[str(course.id)] = ensure_course_folder(course)
    return {"root": root, "standalone": standalone, "courses": courses}


def ensure_course_folder(course):
    key = f"vdocipher_course_folder_{course.id}"
    folder_id = _setting(key)
    if not folder_id:
        root = _setting("vdocipher_root_folder_id") or ensure_folder(ROOT_NAME, "root")
        _set_setting("vdocipher_root_folder_id", root)
        folder_id = ensure_folder(_course_folder_name(course), root)
        _set_setting(key, folder_id)
    return folder_id


def create_upload(title, folder_id):
    folder_id = _require_folder_id(folder_id)
    data = client.create_upload(title, folder_id)
    payload = dict(data.get("clientPayload") or {})
    upload_link = payload.pop("uploadLink", None)
    video_id = data.get("videoId")
    if not video_id or not upload_link:
        raise VdoCipherAdminError("vdocipher_bad_response")
    clear_cache()
    return {"video_id": video_id, "upload_link": upload_link, "fields": payload}
