"""Admin-side VdoCipher library/folder management.

Playback stays in video_provider.py. This file is only for admin actions:
listing hosted videos, ensuring folders, and importing IDs into Baytara.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://dev.vdocipher.com/api"
ROOT_NAME = "Baytara"
STANDALONE_NAME = "Standalone"


class VdoCipherAdminError(Exception):
    pass


def _setting(key):
    try:
        from ..extensions import db
        from ..models import Setting

        s = db.session.get(Setting, key)
        return s.value if s and s.value else None
    except Exception:  # noqa: BLE001 - usable outside app context in tests/imports
        return None


def _set_setting(key, value):
    from ..extensions import db
    from ..models import Setting

    s = db.session.get(Setting, key)
    if s:
        s.value = value
    else:
        db.session.add(Setting(key=key, value=value))


def _secret():
    return _setting("secret_vdocipher") or os.environ.get("VDOCIPHER_API_SECRET")


def configured():
    return bool(_secret())


class VdoCipherAdminClient:
    def _request(self, method, path, body=None, params=None):
        secret = _secret()
        if not secret:
            raise VdoCipherAdminError("no_api_key")
        query = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v not in (None, "")})
        url = BASE + path + (("?" + query) if query else "")
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Authorization", "Apisecret " + secret)
        req.add_header("Accept", "application/json")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=12) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            raise VdoCipherAdminError(f"vdocipher_http_{e.code}")
        except Exception as e:  # noqa: BLE001
            raise VdoCipherAdminError(f"vdocipher_unreachable:{e}")

    def list_videos(self, **params):
        return self._request("GET", "/videos", params=params)

    def search_folders(self, name):
        return self._request("POST", "/videos/folders/search", body={"name": name, "searchExact": True})

    def create_folder(self, name, parent="root"):
        return self._request("POST", "/videos/folders", body={"name": name, "parent": parent})


client = VdoCipherAdminClient()


def _folder_id(row):
    return row.get("id") or row.get("folderId") or row.get("_id")


def ensure_folder(name, parent="root"):
    found = client.search_folders(name).get("folders", [])
    for f in found:
        if f.get("name") == name and _folder_id(f):
            return _folder_id(f)
    created = client.create_folder(name, parent)
    fid = _folder_id(created)
    if not fid:
        raise VdoCipherAdminError("vdocipher_bad_folder_response")
    return fid


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
    fid = _setting(key)
    if not fid:
        root = _setting("vdocipher_root_folder_id") or ensure_folder(ROOT_NAME, "root")
        _set_setting("vdocipher_root_folder_id", root)
        fid = ensure_folder(_course_folder_name(course), root)
        _set_setting(key, fid)
    return fid


def list_videos(q=None, folder_id=None, page=1, limit=20):
    params = {"q": q, "folderId": folder_id, "page": page, "limit": min(int(limit or 20), 40)}
    return client.list_videos(**params)
