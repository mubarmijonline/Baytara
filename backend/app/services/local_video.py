"""Self-hosted video: package an upload into AES-128 encrypted HLS on this machine.

Delivery differs from VdoCipher, the rules do not. A local video still passes through
`POST /api/v1/video/playback`, so enrollment, device binding, the concurrent-stream limit,
the browser policy and both watermarks apply exactly as before. What changes is that the
segments and the AES key come from this server, behind a short-lived signed token.

Honest limit, stated where the code lives: this is NOT DRM. The AES key reaches the browser
in the clear over HTTPS, so a determined viewer can decrypt the stream, and the picture is
capturable in every browser. It is a real barrier to casual copying and to hotlinking; it is
not a substitute for Widevine/FairPlay. See docs/SELF_HOSTED_VIDEO.md.
"""
import os
import secrets
import shutil
import subprocess
from pathlib import Path

RENDITIONS = (
    # name, height, video bitrate, audio bitrate — 720p is the sweet spot for lectures
    ("480p", 480, "1200k", "96k"),
    ("720p", 720, "2500k", "128k"),
)


def video_root(app):
    return Path(app.config["LOCAL_VIDEO_DIR"])


def lesson_dir(app, lesson_id):
    return video_root(app) / str(lesson_id)


def probe_duration_minutes(path):
    """Video length in whole minutes, or None when ffprobe cannot tell."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
            check=True, capture_output=True, text=True, timeout=60,
        ).stdout.strip()
        return max(1, round(float(out) / 60))
    except Exception:  # noqa: BLE001 - duration is cosmetic, never fail the upload for it
        return None


def package(source_path, target_dir):
    """Transcode to encrypted HLS. Returns the master playlist path.

    The key file stays on disk next to the segments but is NEVER served from disk — only
    `GET /api/v1/video/hls/<id>/key` hands it out, and only to an entitled session.
    """
    target = Path(target_dir)
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True, exist_ok=True)

    key = secrets.token_bytes(16)
    key_path = target / "enc.key"
    key_path.write_bytes(key)
    os.chmod(key_path, 0o600)

    # ffmpeg writes this URI into every playlist; the serving endpoint rewrites it to the
    # API path plus the caller's token, so a playlist on disk points nowhere useful.
    info_path = target / "enc.keyinfo"
    info_path.write_text(f"key\n{key_path}\n")
    os.chmod(info_path, 0o600)

    master_lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    for name, height, v_rate, a_rate in RENDITIONS:
        out_dir = target / name
        out_dir.mkdir(exist_ok=True)
        cmd = [
            "ffmpeg", "-v", "error", "-y", "-i", str(source_path),
            "-vf", f"scale=-2:{height}",
            "-c:v", "libx264", "-preset", "veryfast", "-b:v", v_rate,
            "-c:a", "aac", "-b:a", a_rate,
            "-hls_time", "6",
            "-hls_playlist_type", "vod",
            "-hls_key_info_file", str(info_path),
            "-hls_segment_filename", str(out_dir / "seg_%04d.ts"),
            str(out_dir / "index.m3u8"),
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=60 * 60)
        bandwidth = int(v_rate.rstrip("k")) * 1000 + int(a_rate.rstrip("k")) * 1000
        master_lines.append(f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION=x{height}")
        master_lines.append(f"{name}/index.m3u8")

    info_path.unlink(missing_ok=True)  # keeps the key path off disk in a readable file
    master = target / "master.m3u8"
    master.write_text("\n".join(master_lines) + "\n")
    return master


def read_key(app, lesson_id):
    path = lesson_dir(app, lesson_id) / "enc.key"
    return path.read_bytes() if path.exists() else None


def delete(app, lesson_id):
    shutil.rmtree(lesson_dir(app, lesson_id), ignore_errors=True)
