"""The end-of-course exam, and what it takes to pass one.

Shape agreed with the client on 2026-09-16: one multiple-choice exam per course, sat once
the whole course has been watched, pass mark 70%, unlimited attempts, and on a retry the
same questions in a different order. Either an admin or the course's instructor may write
it. A certificate is issued only to someone who has passed.

Two rules are load-bearing and easy to get wrong:

  * A correct answer never leaves the server. Questions go out without any marker of which
    option is right, and grading happens here -- otherwise the exam is answerable by
    reading the response.
  * `is_published` exists so that starting to write an exam does not silently stop every
    learner on that course from earning a certificate. An unpublished, or an empty, exam
    is treated as no exam at all.
"""
import random
from datetime import datetime, timezone

from ..extensions import db

PASS_PERCENT_DEFAULT = 70
MIN_OPTIONS_PER_QUESTION = 2


def _now():
    return datetime.now(timezone.utc)


class CourseExam(db.Model):
    __tablename__ = "course_exams"
    __table_args__ = (db.UniqueConstraint("course_id", name="uq_exam_course"),)

    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id", ondelete="CASCADE"),
                          nullable=False, index=True)
    title = db.Column(db.String(200))
    title_en = db.Column(db.String(200))
    pass_percent = db.Column(db.Integer, nullable=False, default=PASS_PERCENT_DEFAULT,
                             server_default=str(PASS_PERCENT_DEFAULT))
    is_published = db.Column(db.Boolean, nullable=False, default=False, server_default="false")

    # Minutes to finish, or null for no limit. Enforced on the server against the signed
    # token issued with the paper -- a countdown in a browser is a courtesy, not a rule.
    time_limit_minutes = db.Column(db.Integer)

    # Draw this many questions at random from the pool, or null to use every one. This is
    # what turns a bank of forty questions into a ten-question exam that differs per
    # sitting, which is the usual reason an examiner writes more questions than they ask.
    questions_per_attempt = db.Column(db.Integer)

    # Show the candidate which ones they got wrong, and the explanation, after marking.
    # Off by default: on a course with unlimited attempts, handing back the full answer key
    # turns the second attempt into a copying exercise.
    show_results = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
    created_at = db.Column(db.DateTime(timezone=True), default=_now)
    updated_at = db.Column(db.DateTime(timezone=True), default=_now, onupdate=_now)

    course = db.relationship("Course")
    questions = db.relationship(
        "ExamQuestion", back_populates="exam", cascade="all, delete-orphan",
        order_by="ExamQuestion.position, ExamQuestion.id", lazy="selectin",
    )

    def answerable_questions(self):
        """Questions a learner could actually be marked on.

        One with fewer than two options, or without exactly one correct answer, is
        half-written. Counting it would mark someone down for a question that has no right
        answer, so it is skipped everywhere -- in the paper, in the total, and in the score.
        """
        return [q for q in self.questions if q.is_answerable()]

    def is_live(self):
        """Published and actually sittable. Anything else is treated as no exam."""
        return bool(self.is_published) and len(self.answerable_questions()) > 0

    def draw(self, rng=None):
        """The questions this sitting asks: shuffled, and cut to `questions_per_attempt`.

        Returns the model objects, because the caller has to mark against exactly this set
        -- marking against the whole bank would count questions the candidate was never
        shown as wrong.
        """
        rng = rng or random
        questions = list(self.answerable_questions())
        rng.shuffle(questions)
        limit = self.questions_per_attempt
        if limit and limit > 0:
            questions = questions[:limit]
        return questions

    def paper_for(self, rng=None, questions=None):
        """The questions as one attempt sees them: shuffled, and stripped of the answers.

        A retry changes the order of the questions and of each question's options, and
        which questions are drawn when the exam asks for a subset. Order carries no
        meaning because an answer is submitted by option id, so shuffling cannot affect
        marking.
        """
        rng = rng or random
        return [q.to_paper_dict(rng) for q in (questions if questions is not None else self.draw(rng))]

    def to_dict(self, lang="ar", with_answers=False):
        from .catalog import loc

        data = {
            "id": self.id,
            "course_id": self.course_id,
            "title": loc(self.title, self.title_en, lang) if self.title else None,
            "title_en": self.title_en,
            "pass_percent": self.pass_percent,
            "is_published": self.is_published,
            "time_limit_minutes": self.time_limit_minutes,
            "questions_per_attempt": self.questions_per_attempt,
            "show_results": self.show_results,
            "bank_count": len(self.answerable_questions()),
            "question_count": (min(self.questions_per_attempt, len(self.answerable_questions()))
                               if self.questions_per_attempt
                               else len(self.answerable_questions())),
            "is_live": self.is_live(),
        }
        if with_answers:
            # Authoring only. This is the one shape that carries is_correct, and it is
            # returned from admin and instructor endpoints alone.
            data["questions"] = [q.to_dict(lang, with_answers=True) for q in self.questions]
        return data


class ExamQuestion(db.Model):
    __tablename__ = "exam_questions"

    id = db.Column(db.Integer, primary_key=True)
    exam_id = db.Column(db.Integer, db.ForeignKey("course_exams.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    text = db.Column(db.Text, nullable=False)
    text_en = db.Column(db.Text)
    position = db.Column(db.Integer, nullable=False, default=0)

    # Why the right answer is right. Shown after marking when the exam allows it; never
    # part of the paper, or it would carry the answer with it.
    explanation = db.Column(db.Text)
    explanation_en = db.Column(db.Text)

    exam = db.relationship("CourseExam", back_populates="questions")
    options = db.relationship(
        "ExamOption", back_populates="question", cascade="all, delete-orphan",
        order_by="ExamOption.position, ExamOption.id", lazy="selectin",
    )

    def correct_option_id(self):
        correct = [o for o in self.options if o.is_correct]
        return correct[0].id if len(correct) == 1 else None

    def is_answerable(self):
        return (len(self.options) >= MIN_OPTIONS_PER_QUESTION
                and self.correct_option_id() is not None)

    def to_paper_dict(self, rng=None):
        """What a candidate sees. Deliberately has no is_correct anywhere in it."""
        rng = rng or random
        options = list(self.options)
        rng.shuffle(options)
        return {
            "id": self.id,
            "text": self.text,
            "options": [{"id": o.id, "text": o.text} for o in options],
        }

    def to_dict(self, lang="ar", with_answers=False):
        from .catalog import loc

        return {
            "id": self.id,
            "text": loc(self.text, self.text_en, lang),
            "text_en": self.text_en,
            "position": self.position,
            "explanation": loc(self.explanation, self.explanation_en, lang),
            "explanation_en": self.explanation_en,
            "is_answerable": self.is_answerable(),
            "options": [o.to_dict(lang, with_answers=with_answers) for o in self.options],
        }


class ExamOption(db.Model):
    __tablename__ = "exam_options"

    id = db.Column(db.Integer, primary_key=True)
    question_id = db.Column(db.Integer, db.ForeignKey("exam_questions.id", ondelete="CASCADE"),
                            nullable=False, index=True)
    text = db.Column(db.Text, nullable=False)
    text_en = db.Column(db.Text)
    is_correct = db.Column(db.Boolean, nullable=False, default=False, server_default="false")
    position = db.Column(db.Integer, nullable=False, default=0)

    question = db.relationship("ExamQuestion", back_populates="options")

    def to_dict(self, lang="ar", with_answers=False):
        from .catalog import loc

        data = {"id": self.id, "text": loc(self.text, self.text_en, lang),
                "text_en": self.text_en, "position": self.position}
        if with_answers:
            data["is_correct"] = self.is_correct
        return data


class ExamAttempt(db.Model):
    """One sitting. Attempts are unlimited, so these accumulate; the best one is what
    matters and a pass is never revoked by a later failure."""

    __tablename__ = "exam_attempts"

    id = db.Column(db.Integer, primary_key=True)
    exam_id = db.Column(db.Integer, db.ForeignKey("course_exams.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"),
                        nullable=False, index=True)
    score_percent = db.Column(db.Integer, nullable=False, default=0)
    correct_count = db.Column(db.Integer, nullable=False, default=0)
    question_count = db.Column(db.Integer, nullable=False, default=0)
    passed = db.Column(db.Boolean, nullable=False, default=False, index=True)
    submitted_at = db.Column(db.DateTime(timezone=True), default=_now, index=True)

    exam = db.relationship("CourseExam")
    user = db.relationship("User")
    answers = db.relationship("ExamAttemptAnswer", back_populates="attempt",
                              cascade="all, delete-orphan", lazy="selectin")

    def to_dict(self):
        return {
            "id": self.id,
            "score_percent": self.score_percent,
            "correct_count": self.correct_count,
            "question_count": self.question_count,
            "passed": self.passed,
            "submitted_at": self.submitted_at.isoformat() if self.submitted_at else None,
        }


class ExamAttemptAnswer(db.Model):
    """Kept so a result can be explained rather than asserted, and so a question that
    everyone gets wrong is visible to whoever wrote it."""

    __tablename__ = "exam_attempt_answers"

    id = db.Column(db.Integer, primary_key=True)
    attempt_id = db.Column(db.Integer, db.ForeignKey("exam_attempts.id", ondelete="CASCADE"),
                           nullable=False, index=True)
    question_id = db.Column(db.Integer, db.ForeignKey("exam_questions.id", ondelete="SET NULL"),
                            index=True)
    option_id = db.Column(db.Integer, db.ForeignKey("exam_options.id", ondelete="SET NULL"),
                          index=True)   # NULL when the candidate left it blank
    is_correct = db.Column(db.Boolean, nullable=False, default=False)

    attempt = db.relationship("ExamAttempt", back_populates="answers")


def grade(exam, answers, questions=None):
    """Mark one submission. `answers` maps question id -> chosen option id.

    Returns (score_percent, correct_count, question_count, rows) where rows are unsaved
    ExamAttemptAnswer records. Only answerable questions count, so a half-written one
    cannot cost a candidate marks.

    `questions` is the set this sitting was actually shown. It matters once an exam draws
    a subset from a bank: marking against the whole bank would count every question the
    candidate never saw as wrong.
    """
    questions = list(questions) if questions is not None else exam.answerable_questions()
    rows = []
    correct_count = 0
    for question in questions:
        chosen = answers.get(question.id) or answers.get(str(question.id))
        try:
            chosen = int(chosen) if chosen is not None else None
        except (TypeError, ValueError):
            chosen = None
        # An option id from another question is not a right answer to this one.
        if chosen is not None and chosen not in {o.id for o in question.options}:
            chosen = None
        is_correct = chosen is not None and chosen == question.correct_option_id()
        if is_correct:
            correct_count += 1
        rows.append(ExamAttemptAnswer(question_id=question.id, option_id=chosen,
                                      is_correct=is_correct))
    total = len(questions)
    score = round(correct_count / total * 100) if total else 0
    return score, correct_count, total, rows


def passed_attempt(exam_id, user_id):
    return ExamAttempt.query.filter_by(exam_id=exam_id, user_id=user_id, passed=True).first()
