from flask import Blueprint, jsonify, request
from marshmallow import Schema, ValidationError, fields, validate

from ...extensions import db
from ...models import Setting, Article, ContactMessage

bp = Blueprint("content", __name__)


@bp.get("/settings")
def settings():
    """Public site config as a flat {key: value} map."""
    return jsonify(settings={s.key: s.value for s in Setting.query.all()})


@bp.get("/articles")
def articles():
    q = Article.query.filter_by(status="published")
    atype = request.args.get("type")
    if atype in ("blog", "content"):
        q = q.filter_by(type=atype)
    page = max(request.args.get("page", 1, type=int), 1)
    pg = db.paginate(q.order_by(Article.published_at.desc().nullslast(), Article.created_at.desc()),
                     page=page, per_page=12, error_out=False)
    return jsonify(articles=[a.to_dict() for a in pg.items], total=pg.total, page=pg.page, pages=pg.pages)


@bp.get("/articles/<slug>")
def article(slug):
    a = Article.query.filter_by(slug=slug, status="published").first()
    if not a:
        return jsonify(error="not_found"), 404
    return jsonify(article=a.to_dict(full=True))


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
