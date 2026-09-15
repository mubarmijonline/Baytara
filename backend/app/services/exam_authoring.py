"""Writing a course exam. Shared, because an admin and the course's instructor may both
do it and the rules must not drift between the two portals.

Each function raises ExamValidationError or returns the object; the blueprints own
authentication and ownership, and nothing here decides who is allowed to call it.
"""
from ..extensions import db
from ..models import CourseExam, ExamOption, ExamQuestion, PASS_PERCENT_DEFAULT
from ..models.exam import MIN_OPTIONS_PER_QUESTION


class ExamValidationError(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def get_or_create(course_id):
    exam = CourseExam.query.filter_by(course_id=course_id).first()
    if not exam:
        exam = CourseExam(course_id=course_id, pass_percent=PASS_PERCENT_DEFAULT)
        db.session.add(exam)
        db.session.flush()
    return exam


def update_exam(exam, data):
    if "title" in data:
        exam.title = (data["title"] or None)
    if "title_en" in data:
        exam.title_en = (data["title_en"] or None)

    if "pass_percent" in data:
        try:
            value = int(data["pass_percent"])
        except (TypeError, ValueError):
            raise ExamValidationError("invalid_pass_percent")
        # 0 would pass everyone and above 100 could never be reached; either makes the
        # certificate meaningless rather than strict.
        if not 1 <= value <= 100:
            raise ExamValidationError("invalid_pass_percent")
        exam.pass_percent = value

    if "is_published" in data:
        publish = bool(data["is_published"])
        # Publishing an exam is what starts withholding certificates on that course, so it
        # must not be possible while there is nothing to answer.
        if publish and not exam.answerable_questions():
            raise ExamValidationError("exam_has_no_answerable_questions")
        exam.is_published = publish
    return exam


def _apply_options(question, options):
    """Replace a question's options wholesale.

    Editing in place would need stable ids from the client for something the author thinks
    of as one list; replacing is simpler and safe because an option id only ever appears in
    a past attempt's answer row, which is ON DELETE SET NULL.
    """
    if not isinstance(options, list) or len(options) < MIN_OPTIONS_PER_QUESTION:
        raise ExamValidationError("at_least_two_options_required")

    correct = [o for o in options if o.get("is_correct")]
    if len(correct) != 1:
        raise ExamValidationError("exactly_one_correct_option_required")

    rows = []
    for position, option in enumerate(options):
        text = (option.get("text") or "").strip()
        if not text:
            raise ExamValidationError("option_text_required")
        rows.append(ExamOption(text=text, text_en=(option.get("text_en") or None),
                               is_correct=bool(option.get("is_correct")), position=position))
    question.options = rows
    return question


def create_question(exam, data):
    text = (data.get("text") or "").strip()
    if not text:
        raise ExamValidationError("question_text_required")
    position = data.get("position")
    if position is None:
        position = len(exam.questions)
    question = ExamQuestion(exam_id=exam.id, text=text,
                            text_en=(data.get("text_en") or None), position=int(position))
    db.session.add(question)
    db.session.flush()
    _apply_options(question, data.get("options"))
    return question


def update_question(question, data):
    if "text" in data:
        text = (data["text"] or "").strip()
        if not text:
            raise ExamValidationError("question_text_required")
        question.text = text
    if "text_en" in data:
        question.text_en = (data["text_en"] or None)
    if "position" in data:
        question.position = int(data["position"])
    if "options" in data:
        _apply_options(question, data["options"])
    return question


def delete_question(question):
    """Removing the last answerable question also unpublishes the exam.

    Otherwise the course would be left with a published exam nobody can pass, silently
    withholding every certificate on it.
    """
    exam = question.exam
    db.session.delete(question)
    db.session.flush()
    if exam and exam.is_published and not exam.answerable_questions():
        exam.is_published = False
    return exam
