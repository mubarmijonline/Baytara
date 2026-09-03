import os

from app import create_app

app = create_app()


def _resume_packaging_once(application):
    """Restart transcodes a deploy interrupted — in one worker, not all of them.

    gunicorn runs several workers and each would otherwise start ffmpeg on the same
    files. The flock is held for the life of the process and released by the kernel if
    it dies, so a crashed worker does not block the next restart from recovering.
    """
    import fcntl

    from app.api.v1.admin import resume_interrupted_packaging

    folder = application.config["LOCAL_VIDEO_DIR"]
    os.makedirs(folder, exist_ok=True)
    handle = open(os.path.join(folder, ".resume.lock"), "w")  # noqa: SIM115 — held on purpose
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        handle.close()   # another worker got there first
        return
    application.extensions["resume_lock"] = handle
    resume_interrupted_packaging(application)


# Only the served app recovers uploads. CLI entry points share create_app(), and a
# migration is no place to start transcoding.
_resume_packaging_once(app)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
