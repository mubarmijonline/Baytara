"""Link previews for pages people share: an article and a book summary.

The website is a single page app, so every URL answers with the same `index.html` and the
content arrives later through JavaScript. WhatsApp, Facebook, Telegram and X build their
preview card from the HTML alone and never run the script, so every shared link showed the
same card. nginx sends `/blog/<slug>` and `/library/<slug>` here instead; this serves the
deployed `index.html` with the item's own title, summary and cover written into its head.
The page itself is untouched: the browser boots the same app from the same bundle.

Nothing here may cost the page. An unknown or unpublished slug gets the shell exactly as
nginx would have served it, and a shell that cannot be read is a 503, which nginx answers
by serving the static file itself.
"""
import html
import re
from urllib.parse import quote

from flask import Blueprint, Response, current_app, request

from ..models import Article, Book

bp = Blueprint("share", __name__)

SITE_NAME = "بيطرة"
DESCRIPTION_LIMIT = 200

# What the shell says about itself, which an item's own tags replace. Matched one tag at a
# time so attribute order and line breaks in the built file do not matter.
_SHELL_TAGS = [
    re.compile(r"<title>.*?</title>\s*", re.S | re.I),
    re.compile(r"<meta\s[^>]*name=\"description\"[^>]*>\s*", re.S | re.I),
    re.compile(r"<meta\s[^>]*property=\"og:[^\"]*\"[^>]*>\s*", re.S | re.I),
    re.compile(r"<meta\s[^>]*name=\"twitter:[^\"]*\"[^>]*>\s*", re.S | re.I),
    re.compile(r"<link\s[^>]*rel=\"canonical\"[^>]*>\s*", re.S | re.I),
]
_TAG = re.compile(r"<[^>]+>")
_SPACE = re.compile(r"\s+")


def _shell():
    """The deployed index.html, or None if it cannot be read."""
    try:
        with open(current_app.config["WEB_INDEX_HTML"], encoding="utf-8") as fh:
            return fh.read()
    except OSError:
        current_app.logger.warning("share: cannot read %s", current_app.config["WEB_INDEX_HTML"])
        return None


def _plain(text, limit=DESCRIPTION_LIMIT):
    """Text fit for a description: no markup, one line, cut at a word."""
    text = _SPACE.sub(" ", _TAG.sub(" ", text or "")).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    # "الذكية.…" reads as a typo: drop the sentence's own closing mark before ours.
    return cut.rstrip(" .,،؛;:!?؟-—") + "…"


def _absolute(url):
    if not url:
        return None
    if url.startswith(("http://", "https://")):
        return url
    return current_app.config["SITE_URL"].rstrip("/") + "/" + url.lstrip("/")


def _render(shell, *, title, description, image, kind):
    head = shell
    for pattern in _SHELL_TAGS:
        head = pattern.sub("", head)

    # Slugs are Arabic; the URL a crawler is handed back should be the encoded form.
    url = current_app.config["SITE_URL"].rstrip("/") + quote(request.path.rstrip("/"))
    e = lambda v: html.escape(v, quote=True)  # noqa: E731
    tags = [
        f"<title>{e(title)} — {SITE_NAME}</title>",
        f'<meta name="description" content="{e(description)}" />',
        f'<link rel="canonical" href="{e(url)}" />',
        f'<meta property="og:site_name" content="{SITE_NAME}" />',
        '<meta property="og:locale" content="ar_EG" />',
        f'<meta property="og:type" content="{kind}" />',
        f'<meta property="og:url" content="{e(url)}" />',
        f'<meta property="og:title" content="{e(title)}" />',
        f'<meta property="og:description" content="{e(description)}" />',
        f'<meta property="og:image" content="{e(image)}" />',
        '<meta name="twitter:card" content="summary_large_image" />',
        f'<meta name="twitter:title" content="{e(title)}" />',
        f'<meta name="twitter:description" content="{e(description)}" />',
        f'<meta name="twitter:image" content="{e(image)}" />',
    ]
    block = "\n    ".join(tags) + "\n  "
    return head.replace("</head>", "  " + block + "</head>", 1)


def _respond(body):
    response = Response(body, mimetype="text/html")
    # Same as the SPA location in nginx: the shell names the current hashed bundle, so it
    # must never be reused after a deploy.
    response.headers["Cache-Control"] = "no-store, must-revalidate"
    return response


def _page(item_card):
    shell = _shell()
    if shell is None:
        return Response("", status=503)
    if item_card is None:
        return _respond(shell)
    return _respond(_render(shell, **item_card))


def _default_image():
    return _absolute("/brand/og-default.png")


@bp.get("/blog/<slug>", strict_slashes=False)
def article_page(slug):
    article = Article.query.filter_by(slug=slug, status="published").first()
    card = None
    if article:
        card = dict(
            title=article.title,
            description=_plain(article.excerpt) or _plain(article.body) or SITE_NAME,
            image=_absolute(article.cover) or _default_image(),
            kind="article",
        )
    return _page(card)


@bp.get("/library/<slug>", strict_slashes=False)
def book_page(slug):
    book = Book.query.filter_by(slug=slug, status="published").first()
    card = None
    if book:
        summary = _plain(book.excerpt)
        if not summary:
            summary = f"ملخص كتاب {book.title}" + (f" لـ {book.book_author}" if book.book_author else "")
        card = dict(
            title=book.title,
            description=summary,
            image=_absolute(book.cover) or _default_image(),
            kind="book",
        )
    return _page(card)
