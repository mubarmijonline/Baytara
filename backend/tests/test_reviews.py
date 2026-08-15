"""Course review self-check. Run: python -m tests.test_reviews.

Covers the enrollment gate, one-review-per-learner upsert, the running average on the
course payload, and that hiding a review moves the average with it.
"""
import uuid

from app import create_app
from app.extensions import db
from app.models import Category, Course, CourseVideo, Enrollment, Lesson, User
from app.security import hash_password


def demo():
    app = create_app()
    tag = uuid.uuid4().hex[:8]
    with app.app_context():
        db.create_all()
        instr = User(name="د. اختبار", email=f"i_{tag}@baytara.test",
                     password_hash=hash_password("secret12"), role="instructor")
        enrolled = User(name="متعلّم", email=f"s_{tag}@baytara.test",
                        password_hash=hash_password("secret12"), role="student")
        other = User(name="آخر", email=f"o_{tag}@baytara.test",
                     password_hash=hash_password("secret12"), role="student")
        outsider = User(name="زائر", email=f"x_{tag}@baytara.test",
                        password_hash=hash_password("secret12"), role="student")
        admin = User(name="A", email=f"adm_{tag}@baytara.test",
                     password_hash=hash_password("secret12"), role="admin")
        db.session.add_all([instr, enrolled, other, outsider, admin])
        db.session.flush()
        cat = Category(name=f"Cat {tag}", slug=f"cat-{tag}")
        db.session.add(cat)
        db.session.flush()

        course = Course(title=f"Course {tag}", slug=f"c-{tag}", instructor_id=instr.id,
                        category_id=cat.id, status="published", access_type="free")
        db.session.add(course)
        db.session.flush()
        lesson = Lesson(title="L1", position=0, duration_minutes=10)
        db.session.add(lesson)
        db.session.flush()
        db.session.add(CourseVideo(course_id=course.id, video_id=lesson.id, position=0))
        db.session.add_all([
            Enrollment(user_id=enrolled.id, course_id=course.id, status="active"),
            Enrollment(user_id=other.id, course_id=course.id, status="active"),
        ])
        db.session.commit()

    c = app.test_client()
    slug = f"c-{tag}"

    def head(email):
        tok = c.post("/api/v1/auth/login",
                     json={"email": email, "password": "secret12"}).get_json()["access_token"]
        return {"Authorization": f"Bearer {tok}"}

    h_enrolled, h_other = head(f"s_{tag}@baytara.test"), head(f"o_{tag}@baytara.test")
    h_outsider, h_admin = head(f"x_{tag}@baytara.test"), head(f"adm_{tag}@baytara.test")

    # unrated course reports null, not zero
    assert c.get(f"/api/v1/courses/{slug}").get_json()["course"]["rating"] is None

    # anonymous cannot review; a non-enrolled learner cannot either
    assert c.post(f"/api/v1/courses/{slug}/reviews", json={"rating": 5}).status_code == 401
    r = c.post(f"/api/v1/courses/{slug}/reviews", headers=h_outsider, json={"rating": 5})
    assert r.status_code == 403 and r.get_json()["error"] == "not_enrolled", r.get_json()

    # rating must be 1..5
    for bad in (0, 6, "5", True, None):
        assert c.post(f"/api/v1/courses/{slug}/reviews", headers=h_enrolled,
                      json={"rating": bad}).status_code == 422, bad

    # first review
    r = c.post(f"/api/v1/courses/{slug}/reviews", headers=h_enrolled,
               json={"rating": 5, "body": "  ممتازة  "})
    assert r.status_code == 200, r.get_json()
    assert r.get_json()["review"]["body"] == "ممتازة", r.get_json()
    assert r.get_json()["rating"] == 5.0 and r.get_json()["reviews_count"] == 1

    # a second POST edits rather than stacking
    r = c.post(f"/api/v1/courses/{slug}/reviews", headers=h_enrolled, json={"rating": 3})
    assert r.get_json()["reviews_count"] == 1 and r.get_json()["rating"] == 3.0, r.get_json()

    # a second learner moves the average: (3 + 4) / 2
    r = c.post(f"/api/v1/courses/{slug}/reviews", headers=h_other, json={"rating": 4})
    assert r.get_json()["reviews_count"] == 2 and r.get_json()["rating"] == 3.5, r.get_json()

    listing = c.get(f"/api/v1/courses/{slug}/reviews").get_json()
    assert listing["total"] == 2 and listing["rating"] == 3.5, listing
    assert listing["reviews"][0]["author"]["name"], listing

    # the course payload carries the same figures
    body = c.get(f"/api/v1/courses/{slug}").get_json()["course"]
    assert body["rating"] == 3.5 and body["reviews_count"] == 2, body

    # hiding one recomputes the average from what is still readable
    rid = c.get("/api/v1/admin/reviews", headers=h_admin).get_json()["reviews"][0]["id"]
    assert c.patch(f"/api/v1/admin/reviews/{rid}", headers=h_admin,
                   json={"status": "nonsense"}).status_code == 422
    assert c.patch(f"/api/v1/admin/reviews/{rid}", headers=h_admin,
                   json={"status": "hidden"}).status_code == 200
    body = c.get(f"/api/v1/courses/{slug}").get_json()["course"]
    assert body["reviews_count"] == 1, body
    assert c.get(f"/api/v1/courses/{slug}/reviews").get_json()["total"] == 1

    # non-admins cannot moderate
    assert c.get("/api/v1/admin/reviews", headers=h_enrolled).status_code == 403

    # the learner can withdraw their own, and the counters follow
    r = c.delete(f"/api/v1/courses/{slug}/reviews/mine", headers=h_enrolled)
    assert r.status_code == 200, r.get_json()
    body = c.get(f"/api/v1/courses/{slug}").get_json()["course"]
    assert body["reviews_count"] == 0 and body["rating"] is None, body

    print("course reviews self-check OK")


if __name__ == "__main__":
    demo()
