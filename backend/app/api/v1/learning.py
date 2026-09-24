import io
from datetime import datetime, timedelta, timezone

import qrcode
from flask import Blueprint, Response, current_app, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity

from ...extensions import db
from ...models import (
    Certificate, CompletionCertificate, Course, CourseExam, CourseModule, ExamAttempt, Lesson,
    Enrollment, LessonProgress, Payment, User, grade, issue_certificate_if_earned,
    issue_completion_certificate_if_earned, passed_attempt,
)
from ...models.catalog import loc
from ...models.video_monitoring import VideoPlaybackSession
from ...utils import req_lang
from ...services import exam_paper

bp = Blueprint("learning", __name__)

# A watch only counts once the viewer actually got a stream; refusals and provider
# outages are not learning activity.
WATCHED_STATUSES = ("issued", "playing", "paused", "completed", "error", "abandoned")


def _uid():
    return int(get_jwt_identity())


@bp.get("/enrollments")
@jwt_required()
def my_enrollments():
    rows = Enrollment.query.filter_by(user_id=_uid(), status="active").all()
    return jsonify(enrollments=[e.to_dict(lang=req_lang()) for e in rows])


@bp.post("/enrollments")
@jwt_required()
def enroll():
    data = request.get_json() or {}
    course_id = data.get("course_id")
    course = Course.query.filter_by(id=course_id, status="published").first()
    if not course:
        return jsonify(error="course_not_found"), 404

    existing = Enrollment.query.filter_by(user_id=_uid(), course_id=course.id).first()
    if existing and existing.status != "cancelled":
        return jsonify(enrollment=existing.to_dict()), 200

    # Paid tiers (baytarian/general) go through the payment flow.
    if course.is_paid():
        return jsonify(error="payment_required"), 402
    user = db.session.get(User, _uid())
    reason = course.lock_reason(user)
    if reason:  # e.g. vet_free for a non-instructor
        return jsonify(error=reason), 403

    # A course with no fee is not joined at all: nothing is recorded and the learner
    # simply watches. An enrollment only ever means "this seat was bought", which is
    # what makes it worth blocking a delete or refunding. Free courses therefore have
    # no progress, no certificate and no row in «كورساتي» — they are open content.
    return jsonify(enrollment=None, free=True), 200


# ------------------------------ home summary ------------------------------

def _utc_date(value):
    """Calendar date of a stored timestamp. SQLite hands back naive datetimes."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).date()


def _streak_days(days):
    """Length of the run of consecutive days ending today or yesterday. Yesterday counts
    so the streak does not read as broken before the user has watched anything today."""
    today = datetime.now(timezone.utc).date()
    cursor = today if today in days else today - timedelta(days=1)
    if cursor not in days:
        return 0
    total = 0
    while cursor in days:
        total += 1
        cursor -= timedelta(days=1)
    return total


def _resume(user_id, lang):
    """Where the learner left off: the newest watched course video that still sits behind a
    live enrollment. Returns None when there is nothing to resume."""
    rows = (VideoPlaybackSession.query
            .filter(VideoPlaybackSession.user_id == user_id,
                    VideoPlaybackSession.course_id.isnot(None),
                    VideoPlaybackSession.status.in_(WATCHED_STATUSES))
            .order_by(VideoPlaybackSession.last_event_at.desc())
            .limit(20).all())
    for row in rows:
        enrollment = Enrollment.query.filter_by(
            user_id=user_id, course_id=row.course_id, status="active").first()
        if not enrollment or enrollment.is_expired():
            continue
        course = enrollment.course
        videos = course.content_videos()
        if not videos:
            continue
        done = {p.lesson_id for p in enrollment.progress if p.completed_at is not None}
        # The lesson to open next: the first unfinished one, or the last if the course is done.
        index = next((i for i, v in enumerate(videos) if v.id not in done), len(videos) - 1)
        lesson = videos[index]
        total = len(videos)
        percent, _, _ = enrollment.completion()
        return {
            "course": {"id": course.id, "slug": course.slug,
                       "title": loc(course.title, course.title_en, lang)},
            "lesson": {"id": lesson.id, "title": loc(lesson.title, lesson.title_en, lang),
                       "poster": lesson.poster},
            "lesson_index": index + 1,
            "total_lessons": total,
            "remaining_lessons": total - (index + 1),
            "percent": percent,
        }
    return None


def learning_summary(user_id, lang="ar"):
    """The figures behind the home page's «أكمل من حيث توقفت» card.

    ponytail: derived from video_playback_sessions, which nothing prunes today. Add a
    user_activity_days table only if a retention job starts deleting those rows — the
    response shape does not change.

    A streak day means a video was *started* that day; browsing does not count.
    """
    # One unbounded pass: the hours tile means lifetime, so it cannot carry a date filter,
    # and the streak only ever walks backwards from today, so the extra rows cost nothing.
    rows = (db.session.query(VideoPlaybackSession.started_at, VideoPlaybackSession.watched_seconds)
            .filter(VideoPlaybackSession.user_id == user_id,
                    VideoPlaybackSession.status.in_(WATCHED_STATUSES))
            .all())
    days = {d for d in (_utc_date(started) for started, _ in rows) if d}
    watched_seconds = sum((seconds or 0) for _, seconds in rows)
    return {
        "courses_enrolled": Enrollment.query.filter_by(user_id=user_id, status="active").count(),
        "watched_hours": watched_seconds // 3600,
        "streak_days": _streak_days(days),
        "resume": _resume(user_id, lang),
    }


@bp.get("/learning-summary")
@jwt_required()
def my_learning_summary():
    return jsonify(**learning_summary(_uid(), lang=req_lang()))


@bp.get("/progress")
@jwt_required()
def get_progress():
    """Persisted per-lesson progress for the current user in a course (?course=<slug>)."""
    slug = request.args.get("course")
    course = Course.query.filter_by(slug=slug, status="published").first() if slug else None
    if not course:
        return jsonify(error="course_not_found"), 404
    enr = Enrollment.query.filter_by(user_id=_uid(), course_id=course.id, status="active").first()
    if not enr:
        return jsonify(enrolled=False, lessons={}, percent=0)
    lessons = {
        p.lesson_id: {"completed": p.completed_at is not None, "watched_seconds": p.watched_seconds or 0}
        for p in enr.progress
    }
    percent, completed, total = enr.completion()
    return jsonify(enrolled=True, expired=enr.is_expired(),
                   expires_at=enr.to_dict()["expires_at"],
                   lessons=lessons, percent=percent, completed=completed, total=total)


@bp.post("/progress")
@jwt_required()
def update_progress():
    """Upsert lesson progress for the current user's enrollment owning that lesson."""
    data = request.get_json() or {}
    lesson_id = data.get("lesson_id")
    lesson = db.session.get(Lesson, lesson_id) if lesson_id else None
    if not lesson:
        return jsonify(error="lesson_not_found"), 404

    course_id = data.get("course_id")
    enrollments = Enrollment.query.filter_by(user_id=_uid(), status="active")
    if course_id:
        enrollment = enrollments.filter_by(course_id=course_id).first()
        if enrollment and not enrollment.includes_lesson(lesson.id):
            enrollment = None
    else:
        matches = [enrollment for enrollment in enrollments.all() if enrollment.includes_lesson(lesson.id)]
        enrollment = next((item for item in matches if not item.is_expired()), matches[0] if matches else None)
    if not enrollment:
        return jsonify(error="not_enrolled"), 403
    if enrollment.is_expired():
        return jsonify(error="access_expired"), 403

    prog = LessonProgress.query.filter_by(enrollment_id=enrollment.id, lesson_id=lesson.id).first()
    if not prog:
        prog = LessonProgress(enrollment_id=enrollment.id, lesson_id=lesson.id)
        db.session.add(prog)

    if "watched_seconds" in data:
        prog.watched_seconds = max(int(data["watched_seconds"]), prog.watched_seconds or 0)
    if data.get("completed"):
        prog.completed_at = prog.completed_at or datetime.now(timezone.utc)

    db.session.flush()
    # Finishing the last lesson is what earns the certificate; the helper is idempotent.
    certificate = issue_certificate_if_earned(enrollment)
    completion_certificate = issue_completion_certificate_if_earned(enrollment)
    db.session.commit()
    percent, completed, total = enrollment.completion()
    return jsonify(progress={"percent": percent, "completed_lessons": completed, "total_lessons": total},
                   certificate=certificate.to_dict(req_lang()) if certificate else None,
                   completion_certificate=(completion_certificate.to_dict(req_lang())
                                           if completion_certificate else None))


# ------------------------------ course exam ------------------------------

def _exam_context(slug):
    """The course, its live exam and this learner's enrollment, or an error response.

    Sitting the exam needs the same standing as earning the certificate it leads to:
    enrolled, not expired, and every video watched. A course with no exam, or one still
    being written, answers 404 -- there is nothing to sit.
    """
    course = Course.query.filter_by(slug=slug).first()
    if not course:
        return None, None, None, (jsonify(error="course_not_found"), 404)
    exam = CourseExam.query.filter_by(course_id=course.id).first()
    if not exam or not exam.is_live():
        return None, None, None, (jsonify(error="no_exam"), 404)

    enrollment = Enrollment.query.filter_by(user_id=_uid(), course_id=course.id,
                                            status="active").first()
    if not enrollment:
        return None, None, None, (jsonify(error="not_enrolled"), 403)
    if enrollment.is_expired():
        return None, None, None, (jsonify(error="access_expired"), 403)
    return course, exam, enrollment, None


@bp.get("/courses/<slug>/exam")
@jwt_required()
def get_exam(slug):
    """The paper, shuffled, with no answers in it.

    Also returned before the course is finished, with `eligible` false, so the course page
    can say an exam is waiting rather than hiding it until the last video ends.
    """
    course, exam, enrollment, error = _exam_context(slug)
    if error:
        return error

    percent, _, total = enrollment.completion()
    eligible = bool(total) and percent >= 100
    # Also the backfill: someone who finished before the exam was published earns the
    # attendance certificate the first time they open this page.
    completion = issue_completion_certificate_if_earned(enrollment) if eligible else None
    if completion is not None:
        db.session.commit()
    attempts = (ExamAttempt.query
                .filter_by(exam_id=exam.id, user_id=_uid())
                .order_by(ExamAttempt.submitted_at.desc(), ExamAttempt.id.desc()).all())
    best = max((a.score_percent for a in attempts), default=None)

    payload = exam.to_dict(req_lang())
    payload.update({
        "eligible": eligible,
        "course_percent": percent,
        "attempt_count": len(attempts),
        "best_score_percent": best,
        "passed": any(a.passed for a in attempts),
        "attempts": [a.to_dict() for a in attempts[:10]],
        "completion_certificate": completion.to_dict(req_lang()) if completion else None,
    })
    # The questions themselves only go out to someone who may actually sit it.
    if eligible:
        drawn = exam.draw()
        payload["questions"] = exam.paper_for(questions=drawn)
        # Which questions, and when. Marking needs both, and neither can be taken from the
        # candidate's own submission -- see services/exam_paper.py.
        payload["paper_token"] = exam_paper.issue(exam, _uid(), drawn)
    return jsonify(exam=payload)


@bp.post("/courses/<slug>/exam/attempts")
@jwt_required()
def submit_exam(slug):
    """Mark a submission, and issue the certificate when it is a pass.

    Attempts are unlimited by decision, so there is no counter to check. A pass already
    held is never revoked by a later, worse attempt: the certificate lookup is idempotent
    and `passed_attempt` only ever needs one.
    """
    course, exam, enrollment, error = _exam_context(slug)
    if error:
        return error

    percent, _, total = enrollment.completion()
    if not total or percent < 100:
        return jsonify(error="course_not_complete", course_percent=percent), 403

    body = request.get_json(silent=True) or {}
    answers = body.get("answers")
    if not isinstance(answers, dict):
        return jsonify(error="answers_required"), 422

    # An exam that limits time or draws from a bank can only be marked against the paper
    # that was issued. One that does neither is markable from the bank alone, so an older
    # client that sends no token is still answered rather than refused.
    questions = None
    needs_paper = bool(exam.time_limit_minutes) or bool(exam.questions_per_attempt)
    token = body.get("paper_token")
    if needs_paper or token:
        ids, paper_error = exam_paper.verify(token, exam, _uid())
        if paper_error:
            if paper_error == "paper_token_required" and not needs_paper:
                ids = None
            else:
                return jsonify(error=paper_error), 403
        if ids:
            by_id = {q.id: q for q in exam.answerable_questions()}
            # A question deleted since the paper was issued simply drops out; it cannot be
            # marked, and failing the whole submission over it would punish the candidate
            # for an edit they never saw.
            questions = [by_id[i] for i in ids if i in by_id]

    score, correct, question_count, rows = grade(exam, answers, questions=questions)
    attempt = ExamAttempt(
        exam_id=exam.id, user_id=_uid(), score_percent=score, correct_count=correct,
        question_count=question_count, passed=score >= exam.pass_percent,
    )
    attempt.answers = rows
    db.session.add(attempt)
    db.session.flush()

    certificate = issue_certificate_if_earned(enrollment) if attempt.passed else None
    db.session.commit()
    review = None
    if exam.show_results:
        # Only what this sitting asked, and only when the examiner turned it on: handing
        # back the answer key on an exam with unlimited retries makes the next attempt a
        # copying exercise.
        lang = req_lang()
        asked = {q.id: q for q in (questions or exam.answerable_questions())}
        review = [
            {
                "question_id": row.question_id,
                "is_correct": row.is_correct,
                "chosen_option_id": row.option_id,
                "correct_option_id": asked[row.question_id].correct_option_id(),
                "explanation": asked[row.question_id].to_dict(lang).get("explanation"),
            }
            for row in rows if row.question_id in asked
        ]

    return jsonify(
        attempt=attempt.to_dict(),
        pass_percent=exam.pass_percent,
        review=review,
        certificate=certificate.to_dict(req_lang()) if certificate else None,
    ), 201


# ------------------------------ certificates ------------------------------

@bp.get("/certificates")
@jwt_required()
def my_certificates():
    rows = (Certificate.query.filter_by(user_id=_uid())
            .order_by(Certificate.issued_at.desc(), Certificate.id.desc()).all())
    completion = (CompletionCertificate.query.filter_by(user_id=_uid())
                  .order_by(CompletionCertificate.issued_at.desc(), CompletionCertificate.id.desc()).all())
    # A separate key rather than mixed into `certificates`: the mobile app and older builds
    # read that list as verifiable certificates with a public page, which these are not.
    return jsonify(certificates=[c.to_dict(req_lang()) for c in rows],
                   completion_certificates=[c.to_dict(req_lang()) for c in completion])


@bp.get("/certificates/<serial>")
def verify_certificate(serial):
    """Public: anyone holding the serial can confirm the certificate is real. It
    exposes the learner's name and the course, and nothing else about the account."""
    certificate = Certificate.query.filter_by(serial=serial).first()
    if not certificate:
        return jsonify(error="not_found"), 404
    return jsonify(certificate=certificate.to_dict(req_lang()), valid=True)


@bp.get("/completion-certificates/<serial>")
def completion_certificate(serial):
    """The attendance certificate's printable page. Reachable by its unguessable serial so it
    can be opened and printed without extra steps; it verifies nothing and says so by
    omission -- no QR, no "genuine" line, no serial on the sheet."""
    certificate = CompletionCertificate.query.filter_by(serial=serial).first()
    if not certificate:
        return jsonify(error="not_found"), 404
    return jsonify(completion_certificate=certificate.to_dict(req_lang()))


@bp.get("/certificates/<serial>/qr.png")
def certificate_qr(serial):
    """The verification link as a QR code, so a printed certificate can be checked.

    Its own endpoint rather than a data URI on the certificate JSON: the image is larger
    than the record it belongs to, every listing would carry one, and a URL can be cached
    and pointed at by an <img> on the web and the app alike. Public, like the verification
    page it encodes -- it contains nothing the holder of the serial does not already have.

    Unknown serials 404 rather than encoding whatever string was asked for, so the endpoint
    cannot be used to mint a QR code for a certificate that does not exist.
    """
    if not Certificate.query.filter_by(serial=serial).first():
        return jsonify(error="not_found"), 404

    site = (current_app.config.get("SITE_URL") or "").rstrip("/")
    code = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_M,   # readable through a print smudge
        box_size=8, border=2,
    )
    code.add_data(f"{site}/certificates/{serial}")
    code.make(fit=True)
    image = code.make_image(fill_color="#0D1430", back_color="white")   # brand navy on white
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(
        buffer.getvalue(), mimetype="image/png",
        # A serial's link never changes, so this is safe to keep for a long time.
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )


# ------------------------------ activity ------------------------------

@bp.get("/activity")
@jwt_required()
def my_activity():
    """One time-sorted feed.

    ponytail: derived from rows three features already write — lesson completions,
    playback sessions and payments — rather than a user_activity table that would have
    to be kept in step with all three.
    """
    user_id = _uid()
    items = []

    enrollments = Enrollment.query.filter_by(user_id=user_id, status="active").all()
    titles = {}
    for enrollment in enrollments:
        course = enrollment.course
        if not course:
            continue
        for lesson in course.content_videos():
            titles[lesson.id] = (lesson, course)
        for entry in enrollment.progress:
            if entry.completed_at and entry.lesson_id in titles:
                lesson, lesson_course = titles[entry.lesson_id]
                items.append({
                    "type": "lesson_completed", "at": entry.completed_at,
                    "title": lesson.title, "context": lesson_course.title,
                    "href": f"/learn/{lesson_course.slug}/{lesson.id}",
                })

    for certificate in Certificate.query.filter_by(user_id=user_id).all():
        items.append({
            "type": "certificate", "at": certificate.issued_at,
            "title": certificate.course.title if certificate.course else "",
            "context": certificate.serial, "href": f"/certificates/{certificate.serial}",
        })

    for payment in Payment.query.filter_by(user_id=user_id, status="paid").all():
        bought = payment.course or payment.bundle or payment.video
        items.append({
            "type": "purchase", "at": payment.paid_at or payment.created_at,
            "title": getattr(bought, "title", "") or "",
            "context": f"{float(payment.amount or 0):g} {payment.currency}",
            "href": "/dashboard/payments",
        })

    items = [i for i in items if i["at"]]
    items.sort(key=lambda i: i["at"], reverse=True)
    limit = min(max(request.args.get("limit", 10, type=int), 1), 50)
    return jsonify(activity=[{**i, "at": i["at"].isoformat()} for i in items[:limit]])
