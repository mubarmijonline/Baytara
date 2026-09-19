import os

from flask import Blueprint, jsonify, request, current_app, send_from_directory
from flask_jwt_extended import jwt_required
from marshmallow import Schema, ValidationError, fields, validate
from werkzeug.utils import secure_filename

from ...extensions import db
from ...models import Setting, Article, Book, ContactMessage
from ...site_settings import public_settings
from ...utils import public_cache, req_lang

bp = Blueprint("content", __name__)


@bp.get("/settings")
def settings():
    """Public site config. Keys prefixed 'secret_' are admin-only and never exposed."""
    rows = {setting.key: setting.value for setting in Setting.query.all()}
    return public_cache(jsonify(settings=public_settings(rows, req_lang())))


@bp.get("/uploads/<name>")
def uploaded_image(name):
    """Serve an admin-uploaded public image (instructor photo, course cover)."""
    safe = secure_filename(name)
    folder = os.path.abspath(current_app.config["UPLOAD_IMAGE_DIR"])
    if not safe or not os.path.exists(os.path.join(folder, safe)):
        return jsonify(error="not_found"), 404
    return send_from_directory(folder, safe, max_age=86400)


# ------------------------------ the library: book summaries ------------------------------
# Metadata is public so the pages can be found; the PDF itself needs an account, because
# reading it here is the point. Anyone signed in may read -- no verification, by decision:
# the content is our own summary of a published work, not restricted material.

@bp.get("/books")
def list_books():
    lang = req_lang()
    rows = (Book.query.filter_by(status="published")
            .order_by(Book.position, Book.created_at.desc(), Book.id.desc()).all())
    return public_cache(jsonify(books=[b.to_dict(lang) for b in rows]))


@bp.get("/books/<slug>")
def book_detail(slug):
    book = Book.query.filter_by(slug=slug, status="published").first()
    if not book:
        return jsonify(error="not_found"), 404
    return public_cache(jsonify(book=book.to_dict(req_lang())))


@bp.get("/books/<slug>/file.pdf")
@jwt_required()
def book_file(slug):
    """The summary itself, for a signed-in reader.

    Served inline rather than as an attachment, from a path that is never a public URL, so
    the file cannot be linked to or handed around without an account. That is a deterrent,
    not DRM: anyone who can read a page can photograph it. It is proportionate here --
    this is our own summary, and the reason for keeping it on the site is that people come
    back to it, not that it is secret.
    """
    book = Book.query.filter_by(slug=slug, status="published").first()
    if not book or not book.pdf_path:
        return jsonify(error="not_found"), 404
    folder = current_app.config["BOOK_DIR"]
    path = os.path.join(folder, os.path.basename(book.pdf_path))
    if not os.path.exists(path):
        return jsonify(error="not_found"), 404
    response = send_from_directory(folder, os.path.basename(book.pdf_path),
                                   mimetype="application/pdf")
    response.headers["Content-Disposition"] = f'inline; filename="{book.slug}.pdf"'
    response.headers["Cache-Control"] = "private, max-age=0, no-store"
    return response


@bp.get("/articles")
def articles():
    q = Article.query.filter_by(status="published")
    atype = request.args.get("type")
    if atype in ("blog", "content"):
        q = q.filter_by(type=atype)
    page = max(request.args.get("page", 1, type=int), 1)
    pg = db.paginate(q.order_by(Article.published_at.desc().nullslast(), Article.created_at.desc()),
                     page=page, per_page=12, error_out=False)
    lang = req_lang()
    return jsonify(articles=[a.to_dict(lang=lang) for a in pg.items],
                   total=pg.total, page=pg.page, pages=pg.pages)


@bp.get("/articles/<slug>")
def article(slug):
    a = Article.query.filter_by(slug=slug, status="published").first()
    if not a:
        return jsonify(error="not_found"), 404
    return jsonify(article=a.to_dict(full=True, lang=req_lang()))


class ContactSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(min=1, max=160))
    email = fields.Email(required=True)
    subject = fields.Str(load_default="", validate=validate.Length(max=250))
    body = fields.Str(required=True, validate=validate.Length(min=1, max=5000))


@bp.post("/contact")
def contact():
    try:
        data = ContactSchema().load(request.get_json() or {})
    except ValidationError as e:
        return jsonify(error="validation", messages=e.messages), 422
    m = ContactMessage(name=data["name"], email=data["email"].lower(),
                       subject=data.get("subject"), body=data["body"])
    db.session.add(m)
    db.session.commit()
    return jsonify(status="received", id=m.id), 201
