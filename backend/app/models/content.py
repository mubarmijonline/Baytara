from datetime import datetime, timezone

from ..extensions import db


def _now():
    return datetime.now(timezone.utc)


class Setting(db.Model):
    """Key/value site config — hero copy, about, contact info, socials, footer,
    pricing plans, faqs, testimonials, etc. Value is arbitrary JSON."""

    __tablename__ = "settings"

    key = db.Column(db.String(80), primary_key=True)
    value = db.Column(db.JSON)

    def to_dict(self):
        return {"key": self.key, "value": self.value}


ARTICLE_TYPES = ("blog", "content")  # blog article vs free advisory content
ARTICLE_STATUSES = ("draft", "published")


class Article(db.Model):
    """Blog posts + free advisory content (one table, `type` distinguishes)."""

    __tablename__ = "articles"

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(20), nullable=False, default="blog", index=True)
    title = db.Column(db.String(250), nullable=False)
    slug = db.Column(db.String(280), unique=True, nullable=False, index=True)
    excerpt = db.Column(db.String(500))
    body = db.Column(db.Text, nullable=False, default="")
    cover = db.Column(db.String(500))
    status = db.Column(db.String(20), nullable=False, default="draft", index=True)
    author_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    published_at = db.Column(db.DateTime(timezone=True))

    author = db.relationship("User")

    def to_dict(self, full=False):
        d = {
            "id": self.id,
            "type": self.type,
            "title": self.title,
            "slug": self.slug,
            "excerpt": self.excerpt,
            "cover": self.cover,
            "status": self.status,
            "author": self.author.name if self.author else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "published_at": self.published_at.isoformat() if self.published_at else None,
        }
        if full:
            d["body"] = self.body
        return d


class Notification(db.Model):
    __tablename__ = "notifications"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    type = db.Column(db.String(40), nullable=False, default="info")
    title = db.Column(db.String(200), nullable=False)
    body = db.Column(db.String(500))
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id, "type": self.type, "title": self.title, "body": self.body,
            "is_read": self.is_read, "created_at": self.created_at.isoformat() if self.created_at else None,
        }


def push_notification(user_id, type, title, body=None):
    """Add a notification to the session (caller commits — safe inside an atomic tx)."""
    db.session.add(Notification(user_id=user_id, type=type, title=title, body=body))


class ContactMessage(db.Model):
    __tablename__ = "contact_messages"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(160), nullable=False)
    email = db.Column(db.String(255), nullable=False)
    subject = db.Column(db.String(250))
    body = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, nullable=False, default=False, index=True)
    created_at = db.Column(db.DateTime(timezone=True), default=_now)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "email": self.email, "subject": self.subject,
            "body": self.body, "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
