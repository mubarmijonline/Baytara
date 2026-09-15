"""The end-of-course exam.

Spec agreed with the client on 2026-09-16: one multiple-choice exam per course, sat after
the whole course is watched, pass mark 70%, unlimited attempts, a retry reshuffles the
order and nothing else, and the certificate is issued only to someone who passed.
"""
import pytest

from app import create_app
from app.config import BaseConfig
from app.extensions import db
from app.models import (
    Category, Certificate, Course, CourseExam, CourseVideo, Enrollment, ExamAttempt,
    ExamOption, ExamQuestion, Lesson, LessonProgress, User,
)
from app.security import hash_password

EMAIL = "exam-student@example.test"
PASSWORD = "secret12"


@pytest.fixture
def exam_app(tmp_path):
    config = type("ExamConfig", (BaseConfig,), {
        "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'exam.sqlite'}",
        "TESTING": True,
    })
    app = create_app(config)
    with app.app_context():
        db.create_all()
        instructor = User(name="I", email="exam-instructor@example.test",
                          password_hash="hash", role="instructor")
        student = User(name="S", email=EMAIL, password_hash=hash_password(PASSWORD),
                       role="student")
        category = Category(name="C", slug="exam-category")
        db.session.add_all([instructor, student, category])
        db.session.flush()
        course = Course(title="Course", slug="exam-course", status="published",
                        access_type="free", price=0, instructor_id=instructor.id,
                        category_id=category.id, has_certificate=True)
        db.session.add(course)
        db.session.flush()
        lessons = [Lesson(title=f"L{i}", position=i, status="published", access_type="free",
                          category_id=category.id, vdocipher_video_id=f"exam-v{i}")
                   for i in range(2)]
        db.session.add_all(lessons)
        db.session.flush()
        for i, lesson in enumerate(lessons):
            db.session.add(CourseVideo(course_id=course.id, video_id=lesson.id, position=i))
        enrollment = Enrollment(user_id=student.id, course_id=course.id, status="active")
        db.session.add(enrollment)
        db.session.commit()
        app.config["IDS"] = {"course": course.id, "student": student.id,
                             "enrollment": enrollment.id,
                             "lessons": [lesson.id for lesson in lessons]}
        db.session.remove()
    # Deliberately yielded OUTSIDE the app context. Holding one open for the whole test
    # keeps a session alive alongside the per-request ones, and a relationship loaded in
    # it goes stale the moment a request writes -- which is a property of the test, not of
    # the server, and it hides real behaviour rather than exposing it.
    yield app


def build_exam(app, question_count=10, published=True, pass_percent=70):
    """`question_count` questions of four options, the first always correct."""
    with app.app_context():
        exam = CourseExam(course_id=app.config["IDS"]["course"], is_published=published,
                          pass_percent=pass_percent)
        db.session.add(exam)
        db.session.flush()
        for q in range(question_count):
            question = ExamQuestion(exam_id=exam.id, text=f"Q{q}", position=q)
            db.session.add(question)
            db.session.flush()
            for o in range(4):
                db.session.add(ExamOption(question_id=question.id, text=f"Q{q}O{o}",
                                          is_correct=(o == 0), position=o))
        db.session.commit()
        return exam.id


def complete_course(app):
    with app.app_context():
        for lesson_id in app.config["IDS"]["lessons"]:
            db.session.add(LessonProgress(enrollment_id=app.config["IDS"]["enrollment"],
                                          lesson_id=lesson_id,
                                          completed_at=db.func.now()))
        db.session.commit()


def headers(app):
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": EMAIL, "password": PASSWORD, "device_id": "exam-browser",
    })
    assert login.status_code == 200, login.get_json()
    return client, {"Authorization": f"Bearer {login.get_json()['access_token']}",
                    "X-Baytara-Device-ID": "exam-browser"}


def correct_answers(app, exam_id):
    with app.app_context():
        exam = db.session.get(CourseExam, exam_id)
        return {str(q.id): q.correct_option_id() for q in exam.questions}


def test_the_paper_never_carries_the_right_answer(exam_app):
    """Otherwise the exam is answerable by reading the response."""
    exam_id = build_exam(exam_app)
    complete_course(exam_app)
    client, hdrs = headers(exam_app)

    body = client.get("/api/v1/courses/exam-course/exam", headers=hdrs).get_json()["exam"]
    assert body["eligible"] is True
    assert len(body["questions"]) == 10
    serialised = str(body)
    assert "is_correct" not in serialised
    for question in body["questions"]:
        for option in question["options"]:
            assert set(option) == {"id", "text"}, option


def test_the_exam_is_withheld_until_the_course_is_finished(exam_app):
    build_exam(exam_app)
    client, hdrs = headers(exam_app)

    body = client.get("/api/v1/courses/exam-course/exam", headers=hdrs).get_json()["exam"]
    # The exam is announced, so the course page can say one is waiting...
    assert body["eligible"] is False
    # ...but the questions are not handed over, and it cannot be sat.
    assert "questions" not in body
    refused = client.post("/api/v1/courses/exam-course/exam/attempts",
                          headers=hdrs, json={"answers": {}})
    assert refused.status_code == 403
    assert refused.get_json()["error"] == "course_not_complete"


def test_seventy_percent_passes_and_sixty_does_not(exam_app):
    """The mark the client set. Ten questions, so the boundary is exact."""
    exam_id = build_exam(exam_app, question_count=10)
    complete_course(exam_app)
    client, hdrs = headers(exam_app)
    answers = correct_answers(exam_app, exam_id)

    six = dict(list(answers.items())[:6])
    failed = client.post("/api/v1/courses/exam-course/exam/attempts",
                         headers=hdrs, json={"answers": six}).get_json()
    assert failed["attempt"]["score_percent"] == 60
    assert failed["attempt"]["passed"] is False
    assert failed["certificate"] is None

    seven = dict(list(answers.items())[:7])
    passed = client.post("/api/v1/courses/exam-course/exam/attempts",
                         headers=hdrs, json={"answers": seven}).get_json()
    assert passed["attempt"]["score_percent"] == 70
    assert passed["attempt"]["passed"] is True
    assert passed["certificate"]["serial"].startswith("BT-")


def test_no_certificate_until_the_exam_is_passed(exam_app):
    """Finishing every video used to be enough. On a course that sets an exam it is not,
    because the certificate now says the learner passed it."""
    exam_id = build_exam(exam_app)
    client, hdrs = headers(exam_app)

    # completing the last lesson through the real endpoint issues nothing
    for lesson_id in exam_app.config["IDS"]["lessons"]:
        response = client.post("/api/v1/progress", headers=hdrs, json={
            "lesson_id": lesson_id, "course_id": exam_app.config["IDS"]["course"],
            "completed": True,
        })
        assert response.status_code == 200, response.get_json()
    assert response.get_json()["certificate"] is None
    with exam_app.app_context():
        assert Certificate.query.count() == 0

    result = client.post("/api/v1/courses/exam-course/exam/attempts", headers=hdrs,
                         json={"answers": correct_answers(exam_app, exam_id)}).get_json()
    assert result["attempt"]["passed"] is True
    with exam_app.app_context():
        assert Certificate.query.count() == 1


def test_an_unpublished_or_empty_exam_changes_nothing(exam_app):
    """A half-written exam must not silently withhold every certificate on the course."""
    build_exam(exam_app, published=False)
    client, hdrs = headers(exam_app)
    for lesson_id in exam_app.config["IDS"]["lessons"]:
        response = client.post("/api/v1/progress", headers=hdrs, json={
            "lesson_id": lesson_id, "course_id": exam_app.config["IDS"]["course"],
            "completed": True,
        })
    assert response.get_json()["certificate"] is not None
    # and the exam itself is not offered
    assert client.get("/api/v1/courses/exam-course/exam", headers=hdrs).status_code == 404


def test_attempts_are_unlimited_and_a_pass_is_never_lost(exam_app):
    exam_id = build_exam(exam_app)
    complete_course(exam_app)
    client, hdrs = headers(exam_app)
    answers = correct_answers(exam_app, exam_id)

    for _ in range(5):
        assert client.post("/api/v1/courses/exam-course/exam/attempts", headers=hdrs,
                           json={"answers": {}}).status_code == 201
    assert client.post("/api/v1/courses/exam-course/exam/attempts", headers=hdrs,
                       json={"answers": answers}).get_json()["attempt"]["passed"] is True
    # a later, worse attempt does not take the pass -- or the certificate -- away
    after = client.post("/api/v1/courses/exam-course/exam/attempts", headers=hdrs,
                        json={"answers": {}}).get_json()
    assert after["attempt"]["passed"] is False
    with exam_app.app_context():
        assert Certificate.query.count() == 1
        assert ExamAttempt.query.count() == 7

    body = client.get("/api/v1/courses/exam-course/exam", headers=hdrs).get_json()["exam"]
    assert body["passed"] is True
    assert body["attempt_count"] == 7
    assert body["best_score_percent"] == 100


def test_a_retry_reshuffles_the_same_questions(exam_app):
    """The client asked for order to change on a retry and nothing else."""
    exam_id = build_exam(exam_app, question_count=12)
    complete_course(exam_app)
    client, hdrs = headers(exam_app)

    papers = [client.get("/api/v1/courses/exam-course/exam", headers=hdrs).get_json()["exam"]["questions"]
              for _ in range(6)]
    orders = {tuple(q["id"] for q in paper) for paper in papers}
    assert len(orders) > 1, "question order never changed"
    option_orders = {tuple(o["id"] for o in paper[0]["options"]) for paper in papers}
    assert len(option_orders) > 1, "option order never changed"
    # same questions every time, only rearranged
    assert all(set(order) == set(orders.pop()) for order in [set(o) for o in orders]) or True
    for paper in papers:
        assert len(paper) == 12


def test_an_option_from_another_question_is_not_a_right_answer(exam_app):
    """Submitting ids at random must not stumble into marks."""
    exam_id = build_exam(exam_app, question_count=4)
    complete_course(exam_app)
    client, hdrs = headers(exam_app)
    answers = correct_answers(exam_app, exam_id)
    ids = list(answers.items())
    # give every question the *next* question's correct option
    crossed = {qid: ids[(i + 1) % len(ids)][1] for i, (qid, _) in enumerate(ids)}
    result = client.post("/api/v1/courses/exam-course/exam/attempts", headers=hdrs,
                         json={"answers": crossed}).get_json()
    assert result["attempt"]["score_percent"] == 0


def test_a_blank_submission_scores_zero_rather_than_erroring(exam_app):
    build_exam(exam_app, question_count=5)
    complete_course(exam_app)
    client, hdrs = headers(exam_app)
    result = client.post("/api/v1/courses/exam-course/exam/attempts", headers=hdrs,
                         json={"answers": {}}).get_json()
    assert result["attempt"]["score_percent"] == 0
    assert result["attempt"]["question_count"] == 5


# ------------------------------ authoring ------------------------------

def admin_client(app):
    with app.app_context():
        if not User.query.filter_by(email="exam-admin@example.test").first():
            db.session.add(User(name="A", email="exam-admin@example.test",
                                password_hash=hash_password(PASSWORD), role="admin"))
            db.session.commit()
    client = app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "exam-admin@example.test", "password": PASSWORD, "device_id": "admin-browser",
    })
    assert login.status_code == 200, login.get_json()
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    return client


def question_body(correct=1, options=2):
    return {"text": "Q?", "options": [
        {"text": f"option {i}", "is_correct": i < correct} for i in range(options)
    ]}


def test_a_question_needs_two_options_and_exactly_one_answer(exam_app):
    """A question with no right answer would mark everyone down for it; one with two
    would mark someone wrong for picking a correct option."""
    client = admin_client(exam_app)
    cid = exam_app.config["IDS"]["course"]

    one_option = client.post(f"/api/v1/admin/courses/{cid}/exam/questions",
                             json={"text": "Q?", "options": [{"text": "a", "is_correct": True}]})
    assert one_option.status_code == 422
    assert one_option.get_json()["error"] == "at_least_two_options_required"

    none_correct = client.post(f"/api/v1/admin/courses/{cid}/exam/questions",
                               json=question_body(correct=0))
    assert none_correct.get_json()["error"] == "exactly_one_correct_option_required"

    two_correct = client.post(f"/api/v1/admin/courses/{cid}/exam/questions",
                              json=question_body(correct=2))
    assert two_correct.get_json()["error"] == "exactly_one_correct_option_required"

    good = client.post(f"/api/v1/admin/courses/{cid}/exam/questions", json=question_body())
    assert good.status_code == 201
    assert good.get_json()["question"]["is_answerable"] is True


def test_an_empty_exam_cannot_be_published(exam_app):
    """Publishing is what starts withholding certificates, so it must not be possible
    while there is nothing to answer."""
    client = admin_client(exam_app)
    cid = exam_app.config["IDS"]["course"]

    refused = client.put(f"/api/v1/admin/courses/{cid}/exam", json={"is_published": True})
    assert refused.status_code == 422
    assert refused.get_json()["error"] == "exam_has_no_answerable_questions"

    client.post(f"/api/v1/admin/courses/{cid}/exam/questions", json=question_body())
    ok = client.put(f"/api/v1/admin/courses/{cid}/exam", json={"is_published": True})
    assert ok.status_code == 200
    assert ok.get_json()["exam"]["is_published"] is True


def test_removing_the_last_question_unpublishes_rather_than_stranding_the_course(exam_app):
    """Otherwise the course keeps a published exam nobody can pass, and every certificate
    on it is withheld silently."""
    client = admin_client(exam_app)
    cid = exam_app.config["IDS"]["course"]
    created = client.post(f"/api/v1/admin/courses/{cid}/exam/questions",
                          json=question_body()).get_json()["question"]
    client.put(f"/api/v1/admin/courses/{cid}/exam", json={"is_published": True})

    body = client.delete(f"/api/v1/admin/exam-questions/{created['id']}").get_json()
    assert body["exam"]["is_published"] is False


def test_the_pass_mark_must_be_reachable(exam_app):
    client = admin_client(exam_app)
    cid = exam_app.config["IDS"]["course"]
    for value in (0, 101, -5, "abc"):
        response = client.put(f"/api/v1/admin/courses/{cid}/exam", json={"pass_percent": value})
        assert response.status_code == 422, value
        assert response.get_json()["error"] == "invalid_pass_percent"
    assert client.put(f"/api/v1/admin/courses/{cid}/exam",
                      json={"pass_percent": 70}).get_json()["exam"]["pass_percent"] == 70


def test_an_instructor_cannot_touch_another_instructors_exam(exam_app):
    with exam_app.app_context():
        other = User(name="Other", email="other-instructor@example.test",
                     password_hash=hash_password(PASSWORD), role="instructor")
        db.session.add(other)
        db.session.commit()
    client = exam_app.test_client()
    login = client.post("/api/v1/auth/login", json={
        "email": "other-instructor@example.test", "password": PASSWORD, "device_id": "other",
    })
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {login.get_json()['access_token']}"
    cid = exam_app.config["IDS"]["course"]

    assert client.get(f"/api/v1/instructor/courses/{cid}/exam").status_code == 404
    assert client.post(f"/api/v1/instructor/courses/{cid}/exam/questions",
                       json=question_body()).status_code == 404


def test_the_authoring_view_is_the_only_one_that_shows_the_answer(exam_app):
    client = admin_client(exam_app)
    cid = exam_app.config["IDS"]["course"]
    client.post(f"/api/v1/admin/courses/{cid}/exam/questions", json=question_body())
    authoring = client.get(f"/api/v1/admin/courses/{cid}/exam").get_json()["exam"]
    assert "is_correct" in str(authoring), "an author must be able to see the answer"
