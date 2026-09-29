"""The signed paper: what ties a submission to the sitting it came from.

An exam with a time limit, or one that draws ten questions from a bank of forty, cannot be
marked from the request body alone. The server has to know *which* questions this candidate
was shown and *when* they were handed over, and it cannot ask the candidate — that is the
one party with a reason to lie.

So the paper goes out with a signed token carrying the question ids and an issue time.
It is stateless on purpose: no table to clean up, no row leaked by an abandoned attempt,
and a token that cannot be forged because it is signed with the application secret.

A countdown in a browser is a courtesy. This is the rule.
"""
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from flask import current_app

SALT = "baytara-exam-paper"

# Slack for a slow network and a clock that is a little off. Generous enough that nobody
# loses a pass they earned, short enough that it is not a second exam's worth of time.
GRACE_SECONDS = 90


def _serializer():
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=SALT)


def issue(exam, user_id, questions):
    """The token that goes out with the paper."""
    return _serializer().dumps({
        "e": exam.id,
        "u": user_id,
        "q": [q.id for q in questions],
    })


def verify(token, exam, user_id):
    """`(question_ids, error)` — the ids this sitting was shown, or why the token is no good.

    The age limit is the exam's own, so an exam with no limit accepts a token of any age:
    the token is then only carrying which questions were drawn.
    """
    if not token:
        return None, "paper_token_required"
    limit = exam.time_limit_minutes
    max_age = (limit * 60 + GRACE_SECONDS) if limit and limit > 0 else None
    try:
        data = _serializer().loads(token, max_age=max_age)
    except SignatureExpired:
        return None, "exam_time_expired"
    except BadSignature:
        return None, "paper_token_invalid"

    # A token is one candidate's paper for one exam. Replaying someone else's, or one from
    # another course, is not a submission to this exam.
    if data.get("e") != exam.id or data.get("u") != user_id:
        return None, "paper_token_invalid"
    ids = [int(i) for i in (data.get("q") or [])]
    return ids, None
