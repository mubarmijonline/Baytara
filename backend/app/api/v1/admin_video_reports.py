import csv
import io
from datetime import date, datetime, time, timedelta, timezone

from flask import Blueprint, Response, jsonify, request

from ...extensions import db
from ...models import PLAYBACK_SESSION_STATUSES, VideoPlaybackSession
from ...security import require_role
from ...services.catalog_access import ACCESS_TYPES
from ...services.video_monitoring import OPEN_SESSION_STATUSES, mark_stale_sessions_abandoned


bp = Blueprint("admin_video_reports", __name__)
EXPORT_LIMIT = 10_000
MAX_PER_PAGE = 100
SUCCESS_STATUSES = set(PLAYBACK_SESSION_STATUSES) - {"denied", "provider_failed"}


class ReportQueryError(ValueError):
    pass


def report_now():
    return datetime.now(timezone.utc)


def _date_arg(name):
    value = request.args.get(name)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ReportQueryError(f"invalid_{name}") from exc


def _int_arg(name):
    value = request.args.get(name)
    if value in (None, ""):
        return None
    try:
        value = int(value)
    except (TypeError, ValueError) as exc:
        raise ReportQueryError(f"invalid_{name}") from exc
    if value <= 0:
        raise ReportQueryError(f"invalid_{name}")
    return value


def _validate_args():
    status = request.args.get("status")
    access_type = request.args.get("access_type")
    if status and status not in PLAYBACK_SESSION_STATUSES:
        raise ReportQueryError("invalid_status")
    if access_type and access_type not in ACCESS_TYPES:
        raise ReportQueryError("invalid_access_type")
    date_from = _date_arg("date_from")
    date_to = _date_arg("date_to")
    if date_from and date_to and date_from > date_to:
        raise ReportQueryError("invalid_date_range")
    return {
        "video": _int_arg("video"),
        "course": _int_arg("course"),
        "category": request.args.get("category"),
        "access_type": access_type,
        "viewer": request.args.get("viewer"),
        "status": status,
        "device": request.args.get("device"),
        "ip": request.args.get("ip"),
        "date_from": date_from,
        "date_to": date_to,
    }


def filtered_sessions(filters):
    query = VideoPlaybackSession.query
    if filters["video"]:
        query = query.filter(VideoPlaybackSession.video_id == filters["video"])
    if filters["course"]:
        query = query.filter(VideoPlaybackSession.course_id == filters["course"])
    if filters["category"]:
        query = query.filter(VideoPlaybackSession.category_slug == filters["category"])
    if filters["access_type"]:
        query = query.filter(VideoPlaybackSession.access_type == filters["access_type"])
    if filters["viewer"]:
        value = f"%{filters['viewer']}%"
        query = query.filter(db.or_(
            VideoPlaybackSession.viewer_name.ilike(value),
            VideoPlaybackSession.viewer_email.ilike(value),
            VideoPlaybackSession.viewer_phone.ilike(value),
        ))
    if filters["status"]:
        query = query.filter(VideoPlaybackSession.status == filters["status"])
    if filters["device"]:
        query = query.filter(VideoPlaybackSession.device_id == filters["device"])
    if filters["ip"]:
        query = query.filter(VideoPlaybackSession.ip_address == filters["ip"])
    if filters["date_from"]:
        start = datetime.combine(filters["date_from"], time.min, tzinfo=timezone.utc)
        query = query.filter(VideoPlaybackSession.started_at >= start)
    if filters["date_to"]:
        end = datetime.combine(filters["date_to"] + timedelta(days=1), time.min, tzinfo=timezone.utc)
        query = query.filter(VideoPlaybackSession.started_at < end)
    return query


def _prepare_query():
    now = report_now()
    mark_stale_sessions_abandoned(now=now, idle_seconds=60)
    return filtered_sessions(_validate_args()), now


@bp.errorhandler(ReportQueryError)
def _query_error(error):
    return jsonify(error=str(error)), 422


@bp.get("/summary")
@require_role("admin")
def summary():
    query, now = _prepare_query()
    active_cutoff = now - timedelta(seconds=60)
    successful = query.filter(VideoPlaybackSession.status.in_(SUCCESS_STATUSES)).count()
    completed = query.filter(VideoPlaybackSession.status == "completed").count()
    return jsonify(
        attempts=query.count(),
        successful=successful,
        active=query.filter(
            VideoPlaybackSession.status.in_(OPEN_SESSION_STATUSES),
            VideoPlaybackSession.last_event_at >= active_cutoff,
        ).count(),
        unique_viewers=query.with_entities(
            db.func.count(db.func.distinct(VideoPlaybackSession.user_id))
        ).scalar() or 0,
        watch_seconds=query.with_entities(
            db.func.coalesce(db.func.sum(VideoPlaybackSession.watched_seconds), 0)
        ).scalar() or 0,
        completion_rate=round(completed / successful * 100) if successful else 0,
        denied=query.filter(VideoPlaybackSession.status == "denied").count(),
        failures=query.filter(VideoPlaybackSession.status.in_({"provider_failed", "error"})).count(),
    )


@bp.get("/sessions")
@require_role("admin")
def sessions():
    query, _ = _prepare_query()
    page = request.args.get("page", 1, type=int)
    per_page = request.args.get("per_page", 25, type=int)
    if page < 1 or per_page < 1 or per_page > MAX_PER_PAGE:
        raise ReportQueryError("invalid_pagination")
    pagination = db.paginate(
        query.order_by(VideoPlaybackSession.started_at.desc(), VideoPlaybackSession.id.desc()),
        page=page,
        per_page=per_page,
        error_out=False,
    )
    return jsonify(
        sessions=[row.to_admin_dict(include_events=False) for row in pagination.items],
        total=pagination.total,
        page=pagination.page,
        per_page=per_page,
        pages=pagination.pages,
    )


@bp.get("/sessions/<string:session_id>")
@require_role("admin")
def session_detail(session_id):
    mark_stale_sessions_abandoned(now=report_now(), idle_seconds=60)
    session = VideoPlaybackSession.query.filter_by(public_id=session_id).first()
    if not session:
        return jsonify(error="not_found"), 404
    return jsonify(session=session.to_admin_dict(include_events=True))


CSV_FIELDS = (
    "session_reference", "viewer_name", "viewer_email", "viewer_phone", "video_id", "video_title",
    "category", "course_id", "course_title", "access_type", "status", "reason", "device_id",
    "ip_address", "browser", "started_at", "first_played_at", "last_event_at", "ended_at",
    "watched_seconds", "covered_seconds", "duration_seconds", "completion_percent",
)


def _safe_cell(value):
    if value is None:
        return ""
    value = str(value)
    return f"'{value}" if value.startswith(("=", "+", "-", "@")) else value


def _csv_row(session):
    values = {
        "session_reference": session.public_id,
        "viewer_name": session.viewer_name,
        "viewer_email": session.viewer_email,
        "viewer_phone": session.viewer_phone,
        "video_id": session.video_id,
        "video_title": session.video_title,
        "category": session.category_slug,
        "course_id": session.course_id,
        "course_title": session.course_title,
        "access_type": session.access_type,
        "status": session.status,
        "reason": session.reason,
        "device_id": session.device_id,
        "ip_address": session.ip_address,
        "browser": session.user_agent,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "first_played_at": session.first_played_at.isoformat() if session.first_played_at else None,
        "last_event_at": session.last_event_at.isoformat() if session.last_event_at else None,
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "watched_seconds": session.watched_seconds,
        "covered_seconds": session.covered_seconds,
        "duration_seconds": session.duration_seconds,
        "completion_percent": session.completion_percent,
    }
    return {field: _safe_cell(values[field]) for field in CSV_FIELDS}


@bp.get("/export.csv")
@require_role("admin")
def export_csv():
    query, _ = _prepare_query()
    rows = query.order_by(
        VideoPlaybackSession.started_at.desc(), VideoPlaybackSession.id.desc()
    ).limit(EXPORT_LIMIT).all()
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(_csv_row(row) for row in rows)
    response = Response("\ufeff" + output.getvalue(), mimetype="text/csv")
    response.headers["Content-Disposition"] = "attachment; filename=baytara-video-report.csv"
    response.headers["X-Export-Limit"] = str(EXPORT_LIMIT)
    return response
