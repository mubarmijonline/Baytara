import atexit
import os
from contextlib import contextmanager
import tempfile
import uuid


_path = os.path.join(tempfile.gettempdir(), f"baytara-test-{os.getpid()}-{uuid.uuid4().hex}.sqlite")
os.environ["DATABASE_URL"] = f"sqlite:///{_path}"
atexit.register(lambda: os.path.exists(_path) and os.unlink(_path))


# Postgres enforces foreign keys; SQLite does not unless asked, so the suite used to
# pass deletes that fail in production with an IntegrityError. Two shipped bugs came
# from exactly that gap, so the tests now hold the same line the real database does.
from sqlalchemy import event as _event
from sqlalchemy.engine import Engine as _Engine


# Schema surgery is the documented exception: SQLite cannot drop or rebuild a table
# while foreign keys are enforced, which is how Alembic's batch mode works. Tests that
# migrate a schema wrap themselves in without_sqlite_foreign_keys().
_ENFORCE_SQLITE_FKS = True


@_event.listens_for(_Engine, "connect")
def _enforce_sqlite_foreign_keys(dbapi_connection, _record):
    if _ENFORCE_SQLITE_FKS and type(dbapi_connection).__module__.startswith("sqlite3"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


@contextmanager
def without_sqlite_foreign_keys():
    """Run schema migrations, which recreate tables and cannot hold references."""
    global _ENFORCE_SQLITE_FKS
    _ENFORCE_SQLITE_FKS = False
    try:
        yield
    finally:
        _ENFORCE_SQLITE_FKS = True
