"""The reproductive ultrasound calculator (milestone 29).

The formulas must agree with the client's own file to the day. The reference results in
fixtures/sonar_vectors.json were produced by running that file's script
(docs/reference/Baytara_sonar_v6_2.html) in Node; see fixtures/gen_sonar_vectors.js.
"""
import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import SonarExam, User
from app.security import hash_password
from app.services.sonar import SonarInputError, clean_measures, estimate, js_round

VECTORS = json.loads((Path(__file__).parent / "fixtures" / "sonar_vectors.json").read_text())
PASSWORD = "secret12"


@pytest.mark.parametrize("vector", VECTORS, ids=lambda v: f"{v['species']}-{'+'.join(v['measures'])}-{list(v['measures'].values())[0]}")
def test_matches_the_clients_calculator(vector):
    result = estimate(vector["species"], clean_measures(vector["species"], vector["measures"]),
                      date(2026, 10, 26))
    assert [m["age_days"] for m in result["per_measure"]] == vector["ages"]
    assert result["age_days"] == vector["age"]


def test_rounding_is_javascripts():
    assert [js_round(x) for x in (2.5, 3.5, -2.5, 2.4999)] == [3, 4, -2, 2]


def test_expected_birth_counts_from_the_exam_date():
    exam = date(2026, 10, 1)
    r = estimate("bovine", {"bpd": 30}, exam)          # 24.5 + 2.42*30 = 97.1 -> 97
    assert r["age_days"] == 97 and (r["months"], r["extra_days"]) == (3, 7)
    assert r["days_remaining"] == 283 - 97
    assert r["expected_birth"] == (exam + timedelta(days=186)).isoformat()


def test_spread_and_beyond_term_are_reported_not_hidden():
    r = estimate("ovine", {"vesicle": 10, "bpd": 90}, date(2026, 10, 1))
    by = {m["measure"]: m for m in r["per_measure"]}
    assert by["bpd"]["beyond_term"] is True and by["vesicle"]["beyond_term"] is False
    assert r["range_days"] == [by["vesicle"]["age_days"], by["bpd"]["age_days"]]
    # the average is the source's average, beyond-term values included
    assert r["age_days"] == js_round((by["vesicle"]["age_days"] + by["bpd"]["age_days"]) / 2)


def test_at_term_has_no_date():
    r = estimate("ovine", {"bpd": 90}, date(2026, 10, 1))
    assert r["at_term"] is True and r["expected_birth"] is None and r["days_remaining"] == 0


@pytest.mark.parametrize("species,raw,code", [
    ("cat", {"crl": 5}, "bad_species"),
    ("bovine", {}, "no_measurements"),
    ("bovine", {"crl": 0, "bpd": ""}, "no_measurements"),
    ("bovine", {"crl": "abc"}, "bad_number"),
    ("bovine", {"crl": True}, "bad_number"),
    ("bovine", {"crl": -3}, "out_of_range"),
    ("bovine", {"crl": 1001}, "out_of_range"),
    ("bovine", {"crl": float("nan")}, "out_of_range"),
    # horses have no placentome reading; the source drops it, so a lone one is nothing
    ("equine", {"placentome": 20}, "no_measurements"),
])
def test_input_checks(species, raw, code):
    with pytest.raises(SonarInputError) as exc:
        clean_measures(species, raw)
    assert exc.value.code == code


# ------------------------------- the endpoint -------------------------------

@pytest.fixture
def app(tmp_path):
    config = type("SonarConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'sonar.sqlite'}", "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        for name in ("a", "b"):
            db.session.add(User(name=name, email=f"{name}@example.test", phone="+201000000001",
                                password_hash=hash_password(PASSWORD), role="student"))
        db.session.commit()
    yield app


def signed_in(app, who):
    client = app.test_client()
    r = client.post("/api/v1/auth/login", json={"email": f"{who}@example.test",
                                                "password": PASSWORD, "device_id": f"d-{who}"})
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {r.get_json()['access_token']}"
    return client


def test_signed_out_gets_nothing(app):
    c = app.test_client()
    assert c.post("/api/v1/tools/sonar", json={"species": "bovine", "measures": {"crl": 9}}).status_code == 401
    assert c.get("/api/v1/tools/sonar").status_code == 401


def test_calculate_saves_to_own_history_only(app):
    a, b = signed_in(app, "a"), signed_in(app, "b")
    r = a.post("/api/v1/tools/sonar", json={"species": "bovine", "label": "  بقرة 45 ",
                                           "measures": {"crl": 9, "bpd": "12.5"}})
    assert r.status_code == 201, r.get_json()
    exam = r.get_json()["exam"]
    assert exam["label"] == "بقرة 45" and exam["measures"] == {"crl": 9.0, "bpd": 12.5}
    assert exam["result"]["age_days"] == estimate("bovine", {"crl": 9, "bpd": 12.5})["age_days"]

    assert [e["id"] for e in a.get("/api/v1/tools/sonar").get_json()["exams"]] == [exam["id"]]
    assert b.get("/api/v1/tools/sonar").get_json()["exams"] == []
    # b cannot delete a's case
    assert b.delete(f"/api/v1/tools/sonar/{exam['id']}").status_code == 404
    assert a.delete(f"/api/v1/tools/sonar/{exam['id']}").status_code == 200
    assert a.get("/api/v1/tools/sonar").get_json()["exams"] == []


def test_bad_input_and_dates(app):
    a = signed_in(app, "a")
    r = a.post("/api/v1/tools/sonar", json={"species": "bovine", "measures": {"crl": 5000}})
    assert r.status_code == 422 and r.get_json() == {"error": "out_of_range", "field": "crl"}
    future = (date.today() + timedelta(days=3)).isoformat()
    r = a.post("/api/v1/tools/sonar", json={"species": "bovine", "measures": {"crl": 5},
                                           "exam_date": future})
    assert r.status_code == 422 and r.get_json()["error"] == "bad_date"
    past = (date.today() - timedelta(days=10)).isoformat()
    r = a.post("/api/v1/tools/sonar", json={"species": "bovine", "measures": {"crl": 5},
                                           "exam_date": past})
    assert r.status_code == 201 and r.get_json()["exam"]["exam_date"] == past


def test_clear_history_and_paging(app):
    a = signed_in(app, "a")
    for _ in range(52):
        a.post("/api/v1/tools/sonar", json={"species": "ovine", "measures": {"crl": 4}})
    page = a.get("/api/v1/tools/sonar").get_json()
    assert len(page["exams"]) == 50 and page["more"] is True
    rest = a.get(f"/api/v1/tools/sonar?before={page['exams'][-1]['id']}").get_json()
    assert len(rest["exams"]) == 2 and rest["more"] is False
    assert a.delete("/api/v1/tools/sonar").get_json() == {"deleted": 52}
    with app.app_context():
        assert SonarExam.query.count() == 0


def test_today_is_accepted_just_after_midnight(app, monkeypatch):
    """Client report, 2026-10-28 00:35 Cairo: "exam date cannot be in the future" for
    today. Cairo was on summer time (UTC+3); the server assumed UTC+2 and was still on
    the 27th. Frozen at that instant: today is accepted wherever the vet is, the default
    is Cairo's date, and a day nowhere has reached yet is still refused."""
    from datetime import datetime, timezone
    import app.api.v1.tools as tools

    monkeypatch.setattr(tools, "_utc_now", lambda: datetime(2026, 10, 27, 21, 35, tzinfo=timezone.utc))
    a = signed_in(app, "a")
    body = {"species": "bovine", "measures": {"crl": 30}}
    for local_today in ("2026-10-28",   # Cairo, 00:35 EEST
                        "2026-10-28",   # Riyadh / Dubai, 00:35 / 01:35
                        "2026-10-27"):  # anyone still on the 27th
        r = a.post("/api/v1/tools/sonar", json={**body, "exam_date": local_today})
        assert r.status_code == 201, (local_today, r.get_json())
    assert a.post("/api/v1/tools/sonar", json=body).get_json()["exam"]["exam_date"] == "2026-10-28"
    r = a.post("/api/v1/tools/sonar", json={**body, "exam_date": "2026-10-30"})
    assert r.status_code == 422 and r.get_json()["error"] == "bad_date"


def test_dogs_and_cats_are_aged_in_weeks_on_their_four_measurements():
    """V6.2: dogs and cats use ICC, CRL, BPD and BD only, and the source shows weeks."""
    r = estimate("feline", clean_measures("feline", {"crl": 30, "eye_orbit": 9, "hl": 9, "placentome": 9}),
                 date(2026, 10, 1))
    assert [m["measure"] for m in r["per_measure"]] == ["crl"]   # the rest are ignored
    assert r["age_days"] == js_round(21.8 + 0.51 * 30) == 37
    assert (r["age_unit"], r["weeks"], r["week_days"]) == ("weeks", 5, 2)
    assert r["gestation_days"] == 65 and r["days_remaining"] == 28
    assert estimate("canine_small", {"crl": 30})["gestation_days"] == 63
    assert estimate("bovine", {"crl": 30})["age_unit"] == "months"
    with pytest.raises(SonarInputError) as exc:
        clean_measures("canine_large", {"eye_orbit": 5})
    assert exc.value.code == "no_measurements"
