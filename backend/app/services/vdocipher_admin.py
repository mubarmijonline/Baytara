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


def _validate_id(value, error):
    if not isinstance(value, str) or not _ID_RE.fullmatch(value):
        raise VdoCipherAdminError(error)
    return value


def validate_folder_id(folder_id):
    return _validate_id(folder_id, "vdocipher_invalid_folder")


def validate_video_id(video_id):
    return _validate_id(video_id, "vdocipher_invalid_video")


def _provider_folder_id(folder_id):
    return _validate_id(folder_id, "vdocipher_bad_response")


def _provider_video_id(video_id):
    return _validate_id(video_id, "vdocipher_bad_response")


def _id_list(values, validate, error):
    if not isinstance(values, list):
        raise VdoCipherAdminError(error)
    return [validate(value) for value in values]


def _response_object(value):
    if not isinstance(value, dict):
        raise VdoCipherAdminError("vdocipher_bad_response")
    return value


def _mutation_response(value):
    value = _response_object(value)
    if not isinstance(value.get("message"), str):
        raise VdoCipherAdminError("vdocipher_bad_response")
    return {"message": value["message"]}


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
    raw = _response_object(raw)
    return {
        "id": _provider_video_id(raw.get("id")),
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
        folder_id = validate_folder_id(folder_id)
        return self._request("GET", f"/videos/folders/{folder_id}")

    def search_folders(self, name):
        return self._request("POST", "/videos/folders/search", body={"name": name, "searchExact": True})

    def create_folder(self, name, parent="root"):
        return self._request("POST", "/videos/folders", body={"name": name, "parent": validate_folder_id(parent)})

    def rename_folder(self, folder_id, name):
        folder_id = validate_folder_id(folder_id)
        return self._request("PUT", f"/videos/folders/{folder_id}", body={"name": name})

    def move_items(self, folder_id, video_ids, folder_ids):
        folder_id = validate_folder_id(folder_id)
        return self._request(
            "POST", "/videos/move-videos-and-folders",
            body={"folderId": folder_id,
                  "videos": _id_list(video_ids, validate_video_id, "vdocipher_invalid_video"),
                  "folders": _id_list(folder_ids, validate_folder_id, "vdocipher_invalid_folder")},
        )

    def delete_folder(self, folder_id):
        folder_id = validate_folder_id(folder_id)
        return self._request("DELETE", f"/videos/folders/{folder_id}")

    def get_video(self, video_id):
        video_id = validate_video_id(video_id)
        return self._request("GET", f"/videos/{video_id}")

    def update_video(self, video_id, title, description):
        video_id = validate_video_id(video_id)
        return self._request("POST", f"/videos/{video_id}", body={"title": title, "description": description})

    def preview(self, video_id):
        video_id = validate_video_id(video_id)
        data = _response_object(self._request("POST", f"/videos/{video_id}/otp", body={"ttl": 300}))
        if not data.get("otp") or not data.get("playbackInfo"):
            raise VdoCipherAdminError("vdocipher_bad_response")
        return {"otp": data["otp"], "playbackInfo": data["playbackInfo"]}

    def create_upload(self, title, folder_id):
        return self._request("PUT", "/videos", params={"title": title, "folderId": validate_folder_id(folder_id)})


client = VdoCipherAdminClient()


def _folder_id(row):
    row = _response_object(row)
    values = [row[key] for key in ("id", "folderId", "_id") if key in row]
    if not values:
        return None
    folder_id = _provider_folder_id(values[0])
    for value in values[1:]:
        if _provider_folder_id(value) != folder_id:
            raise VdoCipherAdminError("vdocipher_bad_response")
    return folder_id


def _provider_parent_id(parent):
    if parent is None:
        return None
    return _provider_folder_id(parent)


def _normalize_folder_path(folder_path):
    if not isinstance(folder_path, list):
        raise VdoCipherAdminError("vdocipher_bad_response")
    normalized = []
    for item in folder_path:
        item = _response_object(item)
        folder_id = _folder_id(item)
        if folder_id is None:
            raise VdoCipherAdminError("vdocipher_bad_response")
        name = item.get("name")
        if name is not None and not isinstance(name, str):
            raise VdoCipherAdminError("vdocipher_bad_response")
        normalized.append({"id": folder_id, "name": name or ""})
    return normalized


def _normalize_folder(row):
    row = _response_object(row)
    folder_id = _folder_id(row)
    if folder_id is None:
        raise VdoCipherAdminError("vdocipher_bad_response")
    name = row.get("name")
    if name is not None and not isinstance(name, str):
        raise VdoCipherAdminError("vdocipher_bad_response")
    normalized = {"id": folder_id, "name": name or "", "parent": _provider_parent_id(row.get("parent"))}
    if "folderPath" in row:
        normalized["folderPath"] = _normalize_folder_path(row["folderPath"])
    return normalized


def list_videos(q=None, folder_id=None, page=1, limit=20, refresh=False):
    if folder_id is not None:
        validate_folder_id(folder_id)
    params = {"q": q, "folderId": folder_id, "page": max(int(page or 1), 1),
              "limit": min(max(int(limit or 20), 1), 40)}
    key = ("videos", tuple(sorted(params.items())))
    cached = _cache_get(key, refresh)
    if cached is not None:
        return cached
    data = _response_object(client.list_videos(**params))
    rows = data["rows"] if "rows" in data else data.get("videos")
    if not isinstance(rows, list):
        raise VdoCipherAdminError("vdocipher_bad_response")
    return _cache_put(key, {"count": data.get("count", len(rows)), "videos": [normalize_video(row) for row in rows]})


def list_all_folder_videos(folder_id="root", refresh=False):
    """Read every provider page for one exact folder without persisting provider data."""
    folder_id = validate_folder_id(folder_id)
    key = ("all-videos", folder_id)
    cached = _cache_get(key, refresh)
    if cached is not None:
        return cached
    first = list_videos(folder_id=folder_id, page=1, limit=40, refresh=refresh)
    try:
        count = max(int(first["count"]), 0)
    except (KeyError, TypeError, ValueError) as exc:
        raise VdoCipherAdminError("vdocipher_bad_response") from exc
    videos = list(first["videos"])
    for page in range(2, max((count + 39) // 40, 1) + 1):
        videos.extend(list_videos(folder_id=folder_id, page=page, limit=40, refresh=refresh)["videos"])
    return _cache_put(key, {"count": count, "videos": videos})


def list_folder(folder_id, refresh=False):
    folder_id = validate_folder_id(folder_id)
    key = ("folder", folder_id)
    cached = _cache_get(key, refresh)
    if cached is not None:
        return cached
    data = _response_object(client.list_folder(folder_id))
    folders = data.get("folderList", data.get("folders"))
    if not isinstance(folders, list):
        raise VdoCipherAdminError("vdocipher_bad_response")
    current = data.get("current")
    parent = data.get("parent")
    return _cache_put(key, {
        "folders": [_normalize_folder(folder) for folder in folders],
        "current": _normalize_folder(current) if current is not None else None,
        "parent": _normalize_folder(parent) if parent is not None else None,
    })


def create_folder(name, parent_id="root"):
    parent_id = validate_folder_id(parent_id)
    created = _normalize_folder(client.create_folder(name, parent_id))
    clear_cache()
    return created


def rename_folder(folder_id, name):
    result = _mutation_response(client.rename_folder(validate_folder_id(folder_id), name))
    clear_cache()
    return result


def move_items(folder_id, video_ids, folder_ids):
    folder_id = validate_folder_id(folder_id)
    video_ids = _id_list(video_ids, validate_video_id, "vdocipher_invalid_video")
    folder_ids = _id_list(folder_ids, validate_folder_id, "vdocipher_invalid_folder")
    result = _mutation_response(client.move_items(folder_id, video_ids, folder_ids))
    clear_cache()
    return result


def delete_folder(folder_id):
    result = _mutation_response(client.delete_folder(validate_folder_id(folder_id)))
    clear_cache()
    return result


def get_video(video_id):
    return normalize_video(client.get_video(validate_video_id(video_id)))


def update_video(video_id, title, description):
    result = _mutation_response(client.update_video(validate_video_id(video_id), title, description))
    clear_cache()
    return result


def preview(video_id):
    data = _response_object(client.preview(validate_video_id(video_id)))
    if not data.get("otp") or not data.get("playbackInfo"):
        raise VdoCipherAdminError("vdocipher_bad_response")
    return {"otp": data["otp"], "playbackInfo": data["playbackInfo"]}


def ensure_folder(name, parent="root"):
    parent = validate_folder_id(parent)
    found = _response_object(client.search_folders(name)).get("folders", [])
    if not isinstance(found, list):
        raise VdoCipherAdminError("vdocipher_bad_response")
    for folder in [_normalize_folder(folder) for folder in found]:
        if folder["name"] == name:
            return folder["id"]
    created = create_folder(name, parent)
    return created["id"]


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
    folder_id = validate_folder_id(folder_id)
    data = _response_object(client.create_upload(title, folder_id))
    payload = data.get("clientPayload")
    if not isinstance(payload, dict):
        raise VdoCipherAdminError("vdocipher_bad_response")
    payload = dict(payload)
    upload_link = payload.pop("uploadLink", None)
    video_id = _provider_video_id(data.get("videoId"))
    if not isinstance(upload_link, str) or not upload_link:
        raise VdoCipherAdminError("vdocipher_bad_response")
    clear_cache()
    return {"video_id": video_id, "upload_link": upload_link, "fields": payload}
