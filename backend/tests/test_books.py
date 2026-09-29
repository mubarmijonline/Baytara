"""The library's book summaries.

Client's rules, 2026-09-19: our own summaries of published works (never the originals),
readable by anyone with an account -- no verification -- and read on the site rather than
downloaded, so people come back. Metadata stays public so the pages can be found.
"""
import io

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Book, User
from app.security import hash_password

PASSWORD = "secret12"


@pytest.fixture
def app(tmp_path):
    config = type("BookConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'books.sqlite'}",
        "TESTING": True,
        "BOOK_DIR": str(tmp_path / "books"),
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        db.session.add_all([
            User(name="A", email="book-admin@example.test",
                 password_hash=hash_password(PASSWORD), role="admin"),
            # deliberately NOT a verified vet
            User(name="S", email="book-reader@example.test",
                 password_hash=hash_password(PASSWORD), role="student"),
        ])
        db.session.commit()
    yield app


def client_for(app, email, device):
    client = app.test_client()
    login = client.post("/api/v1/auth/login",
                        json={"email": email, "password": PASSWORD, "device_id": device})
    assert login.status_code == 200, login.get_json()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    return client


def a_pdf():
    # Smallest thing that is unmistakably a PDF on the wire.
    return io.BytesIO(b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")


def published_book(app, admin):
    created = admin.post("/api/v1/admin/books", json={
        "title": "ملخص كتاب", "title_en": "Summary", "book_author": "Someone",
        "excerpt": "نظرة عامة",
    }).get_json()["book"]
    admin.post(f"/api/v1/admin/books/{created['id']}/pdf",
               data={"file": (a_pdf(), "summary.pdf", "application/pdf")},
               content_type="multipart/form-data")
    admin.patch(f"/api/v1/admin/books/{created['id']}", json={"status": "published"})
    return created


def test_a_book_cannot_be_published_before_its_pdf_is_there(app):
    admin = client_for(app, "book-admin@example.test", "admin-1")
    created = admin.post("/api/v1/admin/books", json={"title": "Empty"}).get_json()["book"]
    refused = admin.patch(f"/api/v1/admin/books/{created['id']}", json={"status": "published"})
    assert refused.status_code == 422
    assert refused.get_json()["error"] == "pdf_required"


def test_only_a_pdf_is_accepted(app):
    admin = client_for(app, "book-admin@example.test", "admin-1")
    created = admin.post("/api/v1/admin/books", json={"title": "Book"}).get_json()["book"]
    refused = admin.post(f"/api/v1/admin/books/{created['id']}/pdf",
                         data={"file": (io.BytesIO(b"not a pdf"), "x.txt", "text/plain")},
                         content_type="multipart/form-data")
    assert refused.status_code == 415


def test_the_listing_is_public_but_the_file_needs_an_account(app):
    """A page nobody can crawl cannot rank, which is half the reason this section exists.
    The summary itself is what stays behind the sign-in."""
    admin = client_for(app, "book-admin@example.test", "admin-1")
    book = published_book(app, admin)
    anon = app.test_client()

    listed = anon.get("/api/v1/books")
    assert listed.status_code == 200
    assert [b["slug"] for b in listed.get_json()["books"]] == [book["slug"]]
    assert anon.get(f"/api/v1/books/{book['slug']}").status_code == 200

    assert anon.get(f"/api/v1/books/{book['slug']}/file.pdf").status_code == 401


def test_any_signed_in_reader_may_read_it_without_being_a_verified_vet(app):
    admin = client_for(app, "book-admin@example.test", "admin-1")
    book = published_book(app, admin)
    reader = client_for(app, "book-reader@example.test", "reader-1")
    with app.app_context():
        assert User.query.filter_by(email="book-reader@example.test").one().is_baytarian in (False, None)

    got = reader.get(f"/api/v1/books/{book['slug']}/file.pdf")
    assert got.status_code == 200
    assert got.mimetype == "application/pdf"
    assert got.get_data()[:4] == b"%PDF"
    # inline, and not cached to disk: read here rather than kept
    assert got.headers["Content-Disposition"].startswith("inline")
    assert "no-store" in got.headers["Cache-Control"]


def test_a_draft_is_invisible_and_unreadable(app):
    admin = client_for(app, "book-admin@example.test", "admin-1")
    created = admin.post("/api/v1/admin/books", json={"title": "Draft"}).get_json()["book"]
    admin.post(f"/api/v1/admin/books/{created['id']}/pdf",
               data={"file": (a_pdf(), "d.pdf", "application/pdf")},
               content_type="multipart/form-data")
    reader = client_for(app, "book-reader@example.test", "reader-1")
    assert app.test_client().get("/api/v1/books").get_json()["books"] == []
    assert reader.get(f"/api/v1/books/{created['slug']}/file.pdf").status_code == 404


def test_the_stored_file_is_never_named_after_what_was_uploaded(app):
    """The original filename must not become part of a URL anyone could guess."""
    admin = client_for(app, "book-admin@example.test", "admin-1")
    created = admin.post("/api/v1/admin/books", json={"title": "Book"}).get_json()["book"]
    body = admin.post(f"/api/v1/admin/books/{created['id']}/pdf",
                      data={"file": (a_pdf(), "My Secret Upload.pdf", "application/pdf")},
                      content_type="multipart/form-data").get_json()["book"]
    assert "Secret" not in body["pdf_path"]
    assert body["pdf_path"].endswith(".pdf")


def test_deleting_a_book_takes_its_file_with_it(app, tmp_path):
    admin = client_for(app, "book-admin@example.test", "admin-1")
    book = published_book(app, admin)
    with app.app_context():
        stored = db.session.get(Book, book["id"]).pdf_path
    path = tmp_path / "books" / stored
    assert path.exists()
    assert admin.delete(f"/api/v1/admin/books/{book['id']}").status_code == 200
    assert not path.exists()
