"""Learning-summary self-check. Run: python -m tests.test_learning_summary.

Seeds playback sessions on consecutive days and asserts the streak, the lifetime hours
and the resume point (which lesson is next, how many are left, and the percent).
"""
import uuid
from datetime import datetime, timedelta, timezone

from app import create_app
from app.extensions import db
from app.models import (
    Category, Course, CourseVideo, Enrollment, Lesson, LessonProgress, User, VideoPlaybackSession,
)
from app.security import hash_password


def _session(user_id, course_id, video_id, days_ago, seconds, status="completed"):
    when = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return VideoPlaybackSession(
        public_id=uuid.uuid4().hex, user_id=user_id, course_id=course_id, video_id=video_id,
        video_title="v", status=status, watched_seconds=seconds, started_at=when, last_event_at=when,
    )


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        instr = User(name="د. اختبار", email=f"i_{tag}@baytara.test",
                     password_hash=hash_password("secret12"), role="instructor")
        student = User(name="طالب", email=f"s_{tag}@baytara.test",
                       password_hash=hash_password("secret12"), role="student")
        idle = User(name="جديد", email=f"n_{tag}@baytara.test",
                    password_hash=hash_password("secret12"), role="student")
        db.session.add_all([instr, student, idle])
        db.session.flush()
        cat = Category(name=f"Cat {tag}", slug=f"cat-{tag}")
        db.session.add(cat)
        db.session.flush()

        course = Course(title=f"Course {tag}", slug=f"c-{tag}", instructor_id=instr.id,
                        category_id=cat.id, access_type="free", status="published")
        db.session.add(course)
        db.session.flush()
        lessons = [Lesson(title=f"L{i}", position=i, duration_minutes=20) for i in range(3)]
        db.session.add_all(lessons)
        db.session.flush()
        db.session.add_all([CourseVideo(course_id=course.id, video_id=l.id, position=i)
                            for i, l in enumerate(lessons)])

        enr = Enrollment(user_id=student.id, course_id=course.id, status="active")
        db.session.add(enr)
        db.session.flush()
        # first lesson finished -> the next one to open is lesson 2 of 3
        db.session.add(LessonProgress(enrollment_id=enr.id, lesson_id=lessons[0].id,
                                      watched_seconds=1200,
                                      completed_at=datetime.now(timezone.utc)))
        db.session.add_all([
            _session(student.id, course.id, lessons[0].id, 1, 3600),
            _session(student.id, course.id, lessons[1].id, 0, 7200, status="playing"),
            # a refusal breaks nothing: it is neither a streak day nor watched time
            _session(student.id, course.id, lessons[1].id, 4, 9999, status="denied"),
        ])
        db.session.commit()
        second_lesson_id = lessons[1].id

    c = app.test_client()

    def token(email):
        return c.post("/api/v1/auth/login",
                      json={"email": email, "password": "secret12"}).get_json()["access_token"]

    # anonymous callers are turned away
    assert c.get("/api/v1/learning-summary").status_code == 401

    h = {"Authorization": f"Bearer {token(f's_{tag}@baytara.test')}"}
    body = c.get("/api/v1/learning-summary", headers=h).get_json()

    assert body["courses_enrolled"] == 1, body
    assert body["streak_days"] == 2, body          # today + yesterday, the denied day ignored
    assert body["watched_hours"] == 3, body        # 3600 + 7200, denied excluded

    resume = body["resume"]
    assert resume is not None, body
    assert resume["course"]["slug"] == f"c-{tag}", resume
    assert resume["lesson"]["id"] == second_lesson_id, resume
    assert resume["lesson_index"] == 2 and resume["total_lessons"] == 3, resume
    assert resume["remaining_lessons"] == 1, resume
    assert resume["percent"] == 33, resume

    # a learner who has watched nothing gets zeros and no resume card, not an error
    hn = {"Authorization": f"Bearer {token(f'n_{tag}@baytara.test')}"}
    empty = c.get("/api/v1/learning-summary", headers=hn).get_json()
    assert empty == {"courses_enrolled": 0, "watched_hours": 0, "streak_days": 0, "resume": None}, empty

    print("learning summary self-check OK")


if __name__ == "__main__":
    demo()
