"""Moving a paid video off our own server and onto VdoCipher.

The rule since 2026-09-11 is that paid content is never served from local storage: it has
no DRM there. New uploads are refused; this module handles the rows that predate the rule.

Only the encrypted HLS package exists on disk (the source file is deleted after packaging),
so the MP4 is rebuilt from that with the key we hold, uploaded through the same S3 form the
admin SPA uses, and the row switched to VdoCipher. The local package is deliberately kept
until VdoCipher reports the video ready -- a failed or half-processed upload must not be
the moment the only copy disappears. `cleanup()` is the separate, later step that deletes.
"""
import re
import subprocess
from pathlib import Path

import requests

from ..extensions import db
from ..models import Lesson
from . import local_video, vdocipher_admin
from .catalog_access import PAID_ACCESS


def paid_local_lessons():
    """The rows the rule now forbids: paid, still served from our disk."""
    return (Lesson.query
            .filter(Lesson.source == "local", Lesson.access_type.in_(PAID_ACCESS))
            .order_by(Lesson.id).all())


def awaiting_cleanup():
    """Migrated rows whose local package is still on disk."""
    return (Lesson.query
            .filter(Lesson.source == "vdocipher", Lesson.vdocipher_video_id.isnot(None),
                    Lesson.local_status.isnot(None))
            .order_by(Lesson.id).all())


def _best_rendition(lesson_dir):
    # RENDITIONS is ordered low to high; the last one present is the best copy we have.
    for name, *_ in reversed(local_video.RENDITIONS):
        if (lesson_dir / name / "index.m3u8").exists():
            return lesson_dir / name
    raise FileNotFoundError(f"no rendition playlist under {lesson_dir}")


def rebuild_mp4(app, lesson_id, out_path):
    """Decrypt and remux the best local rendition into one MP4, without re-encoding.

    The on-disk playlist says `URI="key"`, which is what the serving endpoint rewrites to
    the API path; on disk it points nowhere. A temporary copy of the playlist naming the
    key file by absolute path is enough for ffmpeg to read the segments in place.
    """
    lesson_dir = local_video.lesson_dir(app, lesson_id)
    key_path = lesson_dir / "enc.key"
    if not key_path.exists():
        raise FileNotFoundError(f"no key for video {lesson_id}")
    rendition = _best_rendition(lesson_dir)
    playlist = (rendition / "index.m3u8").read_text()
    playlist = re.sub(r'URI="[^"]*"', f'URI="file://{key_path.resolve()}"', playlist, count=1)
    temp = rendition / "_migrate.m3u8"
    temp.write_text(playlist)
    try:
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y",
             "-allowed_extensions", "ALL", "-protocol_whitelist", "file,crypto,data",
             "-i", str(temp), "-c", "copy", "-bsf:a", "aac_adtstoasc", str(out_path)],
            check=True, capture_output=True, timeout=60 * 60,
        )
    finally:
        temp.unlink(missing_ok=True)
    return Path(out_path)


def _folder_for(lesson):
    course = lesson.courses[0] if lesson.courses else None
    if course is None and lesson.course_id:
        from ..models import Course
        course = db.session.get(Course, lesson.course_id)
    if course is not None:
        return vdocipher_admin.ensure_course_folder(course)
    return vdocipher_admin.ensure_platform_folders(False)["standalone"]


def upload_to_vdocipher(lesson, mp4_path):
    """The same two steps the admin SPA performs: credentials, then the S3 form post."""
    credentials = vdocipher_admin.create_upload(lesson.title, _folder_for(lesson))
    fields = dict(credentials["fields"])
    fields["success_action_status"] = "201"
    fields["success_action_redirect"] = ""
    with open(mp4_path, "rb") as fh:
        # `data` is sent before `files`, which is the order the form requires: the file
        # must be the last part.
        response = requests.post(
            credentials["upload_link"], data=fields,
            files={"file": (Path(mp4_path).name, fh, "video/mp4")}, timeout=60 * 60,
        )
    if not 200 <= response.status_code < 300:
        raise RuntimeError(f"upload_failed_{response.status_code}")
    return credentials["video_id"]


def migrate(app, lesson, workdir):
    """Rebuild, upload, switch the row. The local package stays until cleanup()."""
    mp4 = Path(workdir) / f"lesson-{lesson.id}.mp4"
    rebuild_mp4(app, lesson.id, mp4)
    try:
        video_id = upload_to_vdocipher(lesson, mp4)
    finally:
        mp4.unlink(missing_ok=True)
    lesson.vdocipher_video_id = video_id
    lesson.source = "vdocipher"
    # local_status is left as it was: a non-null value with source=vdocipher is exactly
    # how cleanup() knows there is still a package on disk to remove.
    db.session.commit()
    return video_id


def cleanup(app, lesson):
    """Delete the local package once VdoCipher says the copy there is ready. Returns the
    provider status so the caller can say why nothing happened."""
    status = (vdocipher_admin.get_video(lesson.vdocipher_video_id).get("status") or "").lower()
    if status != "ready":
        return status
    local_video.delete(app, lesson.id)
    lesson.local_status = None
    lesson.local_error = None
    db.session.commit()
    return status
