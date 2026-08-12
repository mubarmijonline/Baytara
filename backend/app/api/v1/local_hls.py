"""Delivery for self-hosted (local) videos: encrypted HLS behind a short-lived token.

The token is minted only by `POST /api/v1/video/playback`, which has already checked
enrollment, device, concurrency, browser policy and everything else. These endpoints do one
job: verify that token, then hand out the playlist, the segments or the AES key.

Playlists are rewritten on the way out so every URI carries the caller's token — nothing on
disk points at a usable URL.
"""
import hashlib
import hmac
import time
from pathlib import Path

from flask import Blueprint, Response, current_app, jsonify, request, send_file

from ...services import local_video

bp = Blueprint("local_hls", __name__)

TOKEN_TTL_SECONDS = 4 * 60 * 60  # a long lesson must not expire mid-watch


def _secret():
    return current_app.config["SECRET_KEY"].encode()


def issue_token(lesson_id, user_id, session_public_id):
    """Signed, expiring permission to fetch one video's segments and key."""
    expires = int(time.time()) + TOKEN_TTL_SECONDS
    payload = f"{lesson_id}.{user_id}.{session_public_id}.{expires}"
    signature = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}.{signature}"


def verify_token(token, lesson_id):
    """Return the payload dict when the token is valid for this video, else None."""
    if not token:
        return None
    parts = token.split(".")
    if len(parts) != 5:
        return None
    video, user_id, session_id, expires, signature = parts
    payload = f"{video}.{user_id}.{session_id}.{expires}"
    expected = hmac.new(_secret(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(expected, signature):
        return None
    if str(lesson_id) != video:
        return None
    try:
        if int(expires) < int(time.time()):
            return None
    except ValueError:
        return None
    return {"lesson_id": int(video), "user_id": int(user_id), "session_id": session_id}


def _safe_part(value):
    """Path components come from URLs — allow only what we ourselves write."""
    return value and all(c.isalnum() or c in "._-" for c in value) and ".." not in value


@bp.get("/video/hls/<int:lesson_id>/master.m3u8")
def master(lesson_id):
    token = request.args.get("t")
    if not verify_token(token, lesson_id):
        return jsonify(error="invalid_token"), 403
    path = local_video.lesson_dir(current_app, lesson_id) / "master.m3u8"
    if not path.exists():
        return jsonify(error="not_found"), 404
    lines = []
    for line in path.read_text().splitlines():
        if line and not line.startswith("#"):
            line = f"/api/v1/video/hls/{lesson_id}/{line}?t={token}"
        lines.append(line)
    return Response("\n".join(lines) + "\n", mimetype="application/vnd.apple.mpegurl")


@bp.get("/video/hls/<int:lesson_id>/<rendition>/index.m3u8")
def rendition(lesson_id, rendition):
    token = request.args.get("t")
    if not verify_token(token, lesson_id) or not _safe_part(rendition):
        return jsonify(error="invalid_token"), 403
    path = local_video.lesson_dir(current_app, lesson_id) / rendition / "index.m3u8"
    if not path.exists():
        return jsonify(error="not_found"), 404
    base = f"/api/v1/video/hls/{lesson_id}"
    lines = []
    for line in path.read_text().splitlines():
        if line.startswith("#EXT-X-KEY"):
            line = line.replace('URI="key"', f'URI="{base}/key?t={token}"')
        elif line and not line.startswith("#"):
            line = f"{base}/{rendition}/{line}?t={token}"
        lines.append(line)
    return Response("\n".join(lines) + "\n", mimetype="application/vnd.apple.mpegurl")


@bp.get("/video/hls/<int:lesson_id>/key")
def key(lesson_id):
    if not verify_token(request.args.get("t"), lesson_id):
        return jsonify(error="invalid_token"), 403
    material = local_video.read_key(current_app, lesson_id)
    if not material:
        return jsonify(error="not_found"), 404
    return Response(material, mimetype="application/octet-stream",
                    headers={"Cache-Control": "no-store"})


@bp.get("/video/hls/<int:lesson_id>/<rendition>/<segment>")
def segment(lesson_id, rendition, segment):
    if not verify_token(request.args.get("t"), lesson_id):
        return jsonify(error="invalid_token"), 403
    if not (_safe_part(rendition) and _safe_part(segment) and segment.endswith(".ts")):
        return jsonify(error="not_found"), 404
    path = local_video.lesson_dir(current_app, lesson_id) / rendition / segment
    if not path.exists():
        return jsonify(error="not_found"), 404
    return send_file(Path(path).resolve(), mimetype="video/mp2t", max_age=0)
