"""Pinning videos to the front of the public library.

The client's ask, 2026-09-28: for launch, put two or three platform-introduction videos
first, and let everything else follow in whatever order. Uploads otherwise appear newest
first, so a promo uploaded early sinks under everything uploaded after it.
"""
import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import Lesson, User
from app.security import hash_password

PASSWORD = "secret12"


@pytest.fixture
def app(tmp_path):
    config = type("PinConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'pin.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        db.session.add(User(name="Admin", email="admin@x.com", phone="+201000000009",
                            password_hash=hash_password(PASSWORD), role="admin"))
        # Five published, playable videos, created in id order, so newest first is 5..1.
        for i in range(1, 6):
            db.session.add(Lesson(title=f"V{i}", status="published", access_type="free",
                                  source="local", local_status="ready", price=0))
        db.session.commit()
        yield app
        db.session.remove()


def _admin(client):
    token = client.post("/api/v1/auth/login",
                        json={"email": "admin@x.com", "password": PASSWORD}).get_json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _public_titles(client, **params):
    query = "&".join(f"{k}={v}" for k, v in params.items())
    body = client.get(f"/api/v1/videos?{query}").get_json()
    return [v["title"] for v in body["videos"]]


def test_unpinned_videos_are_newest_first(app):
    client = app.test_client()
    titles = _public_titles(client)
    assert titles[0] == "V5", "the default order before anything is pinned"


def test_pinned_videos_lead_in_the_order_set(app):
    client = app.test_client()
    with app.app_context():
        v1 = Lesson.query.filter_by(title="V1").first().id
        v3 = Lesson.query.filter_by(title="V3").first().id

    # V1 is the oldest; pinning must lift it above newer uploads, in the order given.
    r = client.put("/api/v1/admin/videos/pinned", json={"video_ids": [v3, v1]}, headers=_admin(client))
    assert r.status_code == 200
    titles = _public_titles(client)
    assert titles[:2] == ["V3", "V1"]
    # Everything else follows, still newest first.
    assert titles[2:] == ["V5", "V4", "V2"]


def test_setting_the_list_replaces_it(app):
    """One call sets the whole order, so a video left out is unpinned rather than kept."""
    client = app.test_client()
    headers = _admin(client)
    with app.app_context():
        ids = {l.title: l.id for l in Lesson.query.all()}
    client.put("/api/v1/admin/videos/pinned", json={"video_ids": [ids["V1"], ids["V2"]]}, headers=headers)
    client.put("/api/v1/admin/videos/pinned", json={"video_ids": [ids["V2"]]}, headers=headers)
    with app.app_context():
        assert db.session.get(Lesson, ids["V1"]).library_rank is None
        assert db.session.get(Lesson, ids["V2"]).library_rank == 1


def test_an_empty_list_unpins_everything(app):
    client = app.test_client()
    headers = _admin(client)
    with app.app_context():
        v1 = Lesson.query.filter_by(title="V1").first().id
    client.put("/api/v1/admin/videos/pinned", json={"video_ids": [v1]}, headers=headers)
    client.put("/api/v1/admin/videos/pinned", json={"video_ids": []}, headers=headers)
    assert _public_titles(client)[0] == "V5"


def test_an_explicit_sort_is_honoured_over_pinning(app):
    """A visitor who asks for oldest first gets oldest first, pinned or not."""
    client = app.test_client()
    with app.app_context():
        v3 = Lesson.query.filter_by(title="V3").first().id
    client.put("/api/v1/admin/videos/pinned", json={"video_ids": [v3]}, headers=_admin(client))
    assert _public_titles(client, sort="oldest")[0] == "V1"


def test_bad_input_is_refused(app):
    client = app.test_client()
    headers = _admin(client)
    with app.app_context():
        v1 = Lesson.query.filter_by(title="V1").first().id
    assert client.put("/api/v1/admin/videos/pinned", json={"video_ids": [v1, v1]},
                      headers=headers).status_code == 422
    assert client.put("/api/v1/admin/videos/pinned", json={"video_ids": [99999]},
                      headers=headers).status_code == 422
    assert client.put("/api/v1/admin/videos/pinned", json={"video_ids": "1"},
                      headers=headers).status_code == 422


def test_only_an_admin_may_pin(app):
    client = app.test_client()
    assert client.put("/api/v1/admin/videos/pinned", json={"video_ids": []}).status_code in (401, 403)


def test_the_apps_newest_sort_still_leads_with_pinned_videos(app):
    """The app always sends sort=newest. That is the default order, not an override."""
    client = app.test_client()
    with app.app_context():
        v1 = Lesson.query.filter_by(title="V1").first().id
    client.put("/api/v1/admin/videos/pinned", json={"video_ids": [v1]}, headers=_admin(client))
    assert _public_titles(client, sort="newest")[0] == "V1"
    assert _public_titles(client, uncategorized=1)[0] == "V1"


def test_adding_to_a_saved_list_keeps_what_was_already_pinned(app):
    """The client's report, 2026-09-28: four pinned fine, and saving a fifth wiped the four.

    The four kept their positions, so the save set each to the rank it already held. The
    ranks had been cleared by a bulk UPDATE the loaded rows did not see, so those writes
    looked like no change and were never sent: the database kept the four cleared.
    """
    client = app.test_client()
    headers = _admin(client)
    with app.app_context():
        ids = [Lesson.query.filter_by(title=f"V{i}").first().id for i in range(1, 6)]
    client.put("/api/v1/admin/videos/pinned", json={"video_ids": ids[:4]}, headers=headers)

    r = client.put("/api/v1/admin/videos/pinned", json={"video_ids": ids}, headers=headers)
    assert [v["id"] for v in r.get_json()["videos"]] == ids
    assert _public_titles(client)[:5] == ["V1", "V2", "V3", "V4", "V5"]


def test_reordering_keeps_the_videos_whose_place_did_not_change(app):
    client = app.test_client()
    headers = _admin(client)
    with app.app_context():
        a, b, c = (Lesson.query.filter_by(title=t).first().id for t in ("V1", "V2", "V3"))
    client.put("/api/v1/admin/videos/pinned", json={"video_ids": [a, b, c]}, headers=headers)
    # Swap the first two; the third keeps rank 3.
    r = client.put("/api/v1/admin/videos/pinned", json={"video_ids": [b, a, c]}, headers=headers)
    assert [v["id"] for v in r.get_json()["videos"]] == [b, a, c]


def test_twelve_can_be_pinned_and_a_thirteenth_is_refused(app):
    client = app.test_client()
    headers = _admin(client)
    with app.app_context():
        for i in range(6, 14):
            db.session.add(Lesson(title=f"V{i}", status="published", access_type="free",
                                  source="local", local_status="ready", price=0))
        db.session.commit()
        ids = [l.id for l in Lesson.query.order_by(Lesson.id).all()]
    # One at a time, the way the panel is used: each save adds one to the saved list.
    for n in range(1, 13):
        r = client.put("/api/v1/admin/videos/pinned", json={"video_ids": ids[:n]}, headers=headers)
        assert [v["id"] for v in r.get_json()["videos"]] == ids[:n], f"after pinning {n}"
    assert client.put("/api/v1/admin/videos/pinned", json={"video_ids": ids[:13]},
                      headers=headers).status_code == 422
