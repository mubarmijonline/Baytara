"""The public course endpoint answers to a slug and to an id.

The lesson player passes whatever the URL carries straight to this endpoint. The course
page's own "start watching free" button passed the course id, which matched no slug, so
the player rendered its not-found screen instead of the lesson. The button now sends the
slug; this keeps the id working too, because links with it have already been shared.
"""
import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Category, Course, User


@pytest.fixture
def app(tmp_path):
    config = type("CourseLookupConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'course-lookup.sqlite'}",
        "TESTING": True,
    })
    application = create_app(config)
    with application.app_context():
        db.create_all()
        instructor = User(name="Instructor", email="lookup-instructor@example.test",
                          password_hash="hash", role="instructor")
        category = Category(name="Lookup category", slug="lookup-category")
        db.session.add_all([instructor, category])
        db.session.flush()
        published = Course(title="Published", slug="published-lookup-course",
                           instructor_id=instructor.id, category_id=category.id,
                           status="published", access_type="free", price=0)
        draft = Course(title="Draft", slug="draft-lookup-course",
                       instructor_id=instructor.id, category_id=category.id,
                       status="draft", access_type="free", price=0)
        db.session.add_all([published, draft])
        db.session.commit()
        yield application, {"published": published.id, "draft": draft.id}
        db.session.remove()
        db.drop_all()


def test_a_course_answers_to_its_slug_and_to_its_id(app):
    application, ids = app
    client = application.test_client()

    by_slug = client.get("/api/v1/courses/published-lookup-course")
    assert by_slug.status_code == 200
    assert by_slug.get_json()["course"]["id"] == ids["published"]

    by_id = client.get(f"/api/v1/courses/{ids['published']}")
    assert by_id.status_code == 200
    assert by_id.get_json()["course"]["slug"] == "published-lookup-course"


def test_an_id_is_not_a_way_past_the_published_check(app):
    application, ids = app
    client = application.test_client()
    assert client.get(f"/api/v1/courses/{ids['draft']}").status_code == 404
    assert client.get("/api/v1/courses/draft-lookup-course").status_code == 404


def test_nothing_that_does_not_exist_resolves(app):
    application, _ = app
    client = application.test_client()
    assert client.get("/api/v1/courses/99999999").status_code == 404
    assert client.get("/api/v1/courses/no-such-course").status_code == 404
