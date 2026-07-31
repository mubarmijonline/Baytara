import atexit
import os
import tempfile
import uuid


_path = os.path.join(tempfile.gettempdir(), f"baytara-test-{os.getpid()}-{uuid.uuid4().hex}.sqlite")
os.environ["DATABASE_URL"] = f"sqlite:///{_path}"
atexit.register(lambda: os.path.exists(_path) and os.unlink(_path))
