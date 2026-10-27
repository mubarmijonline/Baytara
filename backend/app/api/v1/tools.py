"""Practice tools for signed-in learners. First: the reproductive ultrasound calculator
(milestone 29; formulas in services/sonar.py).

Signed in only, which is the client's condition for using it, and every case read or
deleted here is the caller's own: there is no id-based route that could reach another
account's history.
"""
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

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


CAIRO = ZoneInfo("Africa/Cairo")
# The furthest-ahead calendar on Earth (Line Islands, UTC+14). Its date is the latest
# "today" any learner can be living in.
EARLIEST_ZONE = timezone(timedelta(hours=14))


def _utc_now():
    return datetime.now(timezone.utc)


def _exam_date(raw):
    """The exam date from the request, or today in Cairo when none was sent.

    The page and the app send the learner's own local date, and they already stop a
    future day being picked. So "in the future" here means after today *everywhere*: a
    date the earliest time zone has not reached yet. A fixed offset got this wrong. It
    assumed Cairo was UTC+2, and in summer time (UTC+3) every scan entered between
    midnight and 1 am was refused as tomorrow (client report, 2026-10-28, 00:35); a vet in
    the Gulf would have lost two hours a night.
    """
    now = _utc_now()
    if not raw:
        return now.astimezone(CAIRO).date()
    try:
        value = date.fromisoformat(str(raw))
    except ValueError:
        raise SonarInputError("bad_date", "exam_date") from None
    # A scan can be recorded late, but not before it happened, and not years back.
    latest_today = now.astimezone(EARLIEST_ZONE).date()
    if value > latest_today or value < now.astimezone(CAIRO).date() - timedelta(days=366):
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
