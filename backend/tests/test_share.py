"""Shared article and book links carry their own preview card.

Client request, carried from 2026-09: every /blog/<slug> and /library/<slug> link pasted
into WhatsApp showed the same generic card, because the crawlers read only the SPA shell.
"""
import re

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Article, Book

SHELL = """<!DOCTYPE html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta
      name="description"
      content="وصف الموقع"
    />
    <title>بيطرة — منصة التعلّم البيطري</title>
    <meta property="og:title" content="بيطرة — منصة التعلّم البيطري" />
    <meta property="og:image" content="https://baytara.app/brand/og-default.png" />
    <meta property="og:image:width" content="1200" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
"""


@pytest.fixture
def app(tmp_path):
    shell = tmp_path / "index.html"
    shell.write_text(SHELL, encoding="utf-8")
    config = type("ShareConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'share.sqlite'}",
        "TESTING": True,
        "SITE_URL": "https://baytara.test",
        "WEB_INDEX_HTML": str(shell),
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        db.session.add_all([
            Article(title='التهاب الضرع "الحاد" <عند> الأبقار', slug="mastitis", status="published",
                    excerpt="كيف تكتشفه مبكراً", cover="/api/v1/uploads/mastitis.jpg",
                    body="نص"),
            Article(title="بدون ملخص", slug="no-excerpt", status="published",
                    body="<p>الفقرة الأولى</p>\n\n" + "كلمة " * 100),
            Article(title="مسودة", slug="draft-article", status="draft", body=""),
            Article(title="دليل العيادة", slug="دليل-العيادة", status="published", body="نص"),
            Book(title="علم الأدوية البيطرية", slug="pharmacology", status="published",
                 book_author="Riviere", cover="https://cdn.example/cover.png"),
            Book(title="مسودة كتاب", slug="draft-book", status="draft"),
        ])
        db.session.commit()
    yield app


def meta(page, attr, name):
    found = re.findall(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)"', page)
    return found


def test_an_article_link_carries_its_own_card(app):
    response = app.test_client().get("/blog/mastitis")
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store, must-revalidate"
    page = response.get_data(as_text=True)

    # Escaped, and the shell's own tags gone so a crawler sees exactly one of each.
    title = "التهاب الضرع &quot;الحاد&quot; &lt;عند&gt; الأبقار"
    assert meta(page, "property", "og:title") == [title]
    assert meta(page, "property", "og:description") == ["كيف تكتشفه مبكراً"]
    assert meta(page, "property", "og:image") == ["https://baytara.test/api/v1/uploads/mastitis.jpg"]
    assert meta(page, "property", "og:url") == ["https://baytara.test/blog/mastitis"]
    assert meta(page, "property", "og:type") == ["article"]
    assert meta(page, "property", "og:image:width") == []
    assert meta(page, "name", "description") == ["كيف تكتشفه مبكراً"]
    assert meta(page, "name", "twitter:card") == ["summary_large_image"]
    assert page.count("<title>") == 1
    assert f"<title>{title} — بيطرة</title>" in page

    # The app still boots from the same bundle.
    assert '<script type="module" crossorigin src="/assets/index-abc.js"></script>' in page
    assert '<div id="root"></div>' in page


def test_an_article_without_an_excerpt_is_described_by_its_opening_words(app):
    page = app.test_client().get("/blog/no-excerpt/").get_data(as_text=True)
    [description] = meta(page, "property", "og:description")
    assert description.startswith("الفقرة الأولى كلمة")
    assert "<p>" not in description and len(description) <= 201
    assert description.endswith("…")
    assert meta(page, "property", "og:image") == ["https://baytara.test/brand/og-default.png"]
    assert meta(page, "property", "og:url") == ["https://baytara.test/blog/no-excerpt"]


def test_an_arabic_slug_is_found_and_handed_back_encoded(app):
    page = app.test_client().get("/blog/%D8%AF%D9%84%D9%8A%D9%84-%D8%A7%D9%84%D8%B9%D9%8A%D8%A7%D8%AF%D8%A9")\
        .get_data(as_text=True)
    assert meta(page, "property", "og:title") == ["دليل العيادة"]
    assert meta(page, "property", "og:url") == [
        "https://baytara.test/blog/%D8%AF%D9%84%D9%8A%D9%84-%D8%A7%D9%84%D8%B9%D9%8A%D8%A7%D8%AF%D8%A9"]


def test_a_cut_description_does_not_end_in_a_full_stop_and_an_ellipsis(app):
    with app.app_context():
        db.session.add(Article(title="t", slug="stop", status="published",
                               excerpt=("جملة. " * 40).strip(), body=""))
        db.session.commit()
    page = app.test_client().get("/blog/stop").get_data(as_text=True)
    [description] = meta(page, "property", "og:description")
    assert description.endswith("جملة…")


def test_a_book_link_carries_its_own_card(app):
    page = app.test_client().get("/library/pharmacology").get_data(as_text=True)
    assert meta(page, "property", "og:title") == ["علم الأدوية البيطرية"]
    assert meta(page, "property", "og:description") == ["ملخص كتاب علم الأدوية البيطرية لـ Riviere"]
    assert meta(page, "property", "og:image") == ["https://cdn.example/cover.png"]
    assert meta(page, "property", "og:type") == ["book"]


@pytest.mark.parametrize("path", ["/blog/draft-article", "/blog/missing",
                                  "/library/draft-book", "/library/missing"])
def test_an_unpublished_or_unknown_item_gets_the_shell_unchanged(app, path):
    response = app.test_client().get(path)
    assert response.status_code == 200
    assert response.get_data(as_text=True) == SHELL


def test_an_unreadable_shell_is_a_503_so_nginx_serves_the_static_file(app):
    app.config["WEB_INDEX_HTML"] = "/nonexistent/index.html"
    assert app.test_client().get("/blog/mastitis").status_code == 503
