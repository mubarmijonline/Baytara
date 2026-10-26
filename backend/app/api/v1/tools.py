"""Practice tools for signed-in learners. First: the reproductive ultrasound calculator
(milestone 29; formulas in services/sonar.py).

Signed in only, which is the client's condition for using it, and every case read or
deleted here is the caller's own: there is no id-based route that could reach another
account's history.
"""
from datetime import date, datetime, timedelta, timezone

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from ...extensions import db
from ...models import SonarExam, User
from ...services.sonar import SonarInputError, clean_measures, estimate

bp = Blueprint("tools", __name__)

HISTORY_PAGE = 50
LABEL_MAX = 120


def _user():
    user = db.session.get(User, int(get_jwt_identity()))
    return user if user and user.is_active else None


def _today_cairo():
    # Egypt is UTC+2 or +3 depending on the season; +2 is close enough to pick the
    # calendar day a vet in the barn is living in, and never lands a day ahead.
    return (datetime.now(timezone.utc) + timedelta(hours=2)).date()


def _exam_date(raw):
    today = _today_cairo()
    if not raw:
        return today
    try:
        value = date.fromisoformat(str(raw))
    except ValueError:
        raise SonarInputError("bad_date", "exam_date") from None
    # A scan can be recorded late, but not before it happened, and not years back.
    if value > today or value < today - timedelta(days=366):
        raise SonarInputError("bad_date", "exam_date")
    return value


@bp.post("/tools/sonar")
@jwt_required()
def sonar_calculate():
    user = _user()
    if not user:
        return jsonify(error="invalid_user"), 401
    body = request.get_json(silent=True) or {}
    species = body.get("species")
    try:
        measures = clean_measures(species, body.get("measures"))
        exam_date = _exam_date(body.get("exam_date"))
    except SonarInputError as exc:
        return jsonify(error=exc.code, field=exc.field), 422
    result = estimate(species, measures, exam_date)
    label = str(body.get("label") or "").strip()[:LABEL_MAX] or None
    exam = SonarExam(user_id=user.id, label=label, species=species, measures=measures,
                     result=result, exam_date=exam_date)
    db.session.add(exam)
    db.session.commit()
    return jsonify(exam=exam.to_dict()), 201


@bp.get("/tools/sonar")
@jwt_required()
def sonar_history():
    user = _user()
    if not user:
        return jsonify(error="invalid_user"), 401
    before = request.args.get("before", type=int)
    q = SonarExam.query.filter_by(user_id=user.id)
    if before:
        q = q.filter(SonarExam.id < before)
    rows = q.order_by(SonarExam.id.desc()).limit(HISTORY_PAGE + 1).all()
    return jsonify(exams=[r.to_dict() for r in rows[:HISTORY_PAGE]],
                   more=len(rows) > HISTORY_PAGE)


@bp.delete("/tools/sonar/<int:exam_id>")
@jwt_required()
def sonar_delete(exam_id):
    user = _user()
    if not user:
        return jsonify(error="invalid_user"), 401
    deleted = SonarExam.query.filter_by(id=exam_id, user_id=user.id).delete()
    db.session.commit()
    if not deleted:
        return jsonify(error="not_found"), 404
    return jsonify(deleted=exam_id)


@bp.delete("/tools/sonar")
@jwt_required()
def sonar_clear():
    user = _user()
    if not user:
        return jsonify(error="invalid_user"), 401
    count = SonarExam.query.filter_by(user_id=user.id).delete()
    db.session.commit()
    return jsonify(deleted=count)
