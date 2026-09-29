"""Seed demo courses and verify one account. Idempotent: safe to re-run.

Run with --apply to write; without it, reports what it would do and changes nothing.
"""
import sys
sys.path.insert(0, '/development/projects/baytara/backend')

from app import create_app
from app.extensions import db
from app.models import Category, Course, CourseVideo, Lesson, User
from app.models.learning import Enrollment

APPLY = '--apply' in sys.argv
VERIFY_EMAIL = 'omarashrafwo@gmail.com'

# Realistic Arabic veterinary courses, as approved. Slugs are prefixed `demo-` so every row
# created here can be found and removed with one query later.
COURSES = [
    dict(slug='demo-bovine-diagnostics',
         title='أساسيات تشخيص أمراض الأبقار',
         title_en='Fundamentals of Bovine Disease Diagnosis',
         description='دورة عملية تغطي الفحص الإكلينيكي للأبقار، قراءة العلامات الحيوية، '
                     'والتفريق بين أهم الأمراض الشائعة في قطعان الحلاب.',
         access_type='free', price=0, level='beginner', has_certificate=True,
         objectives=['الفحص الإكلينيكي المنهجي للأبقار',
                     'قراءة العلامات الحيوية وتفسيرها',
                     'التفريق بين الحمى الثلاثية والأمراض المشابهة'],
         attach_videos=True),
    dict(slug='demo-small-animal-surgery',
         title='جراحة الحيوانات الصغيرة',
         title_en='Small Animal Surgery',
         description='من التحضير للجراحة وحتى الرعاية بعد العملية: التخدير الآمن، '
                     'الشقوق الجراحية الشائعة، والتعامل مع المضاعفات.',
         access_type='baytarian', price=450, level='intermediate', has_certificate=True,
         objectives=['التحضير والتعقيم قبل الجراحة',
                     'بروتوكولات التخدير الآمنة',
                     'الرعاية بعد العملية ومتابعة المضاعفات'],
         attach_videos=False),
    dict(slug='demo-poultry-health',
         title='صحة الدواجن وإدارة القطيع',
         title_en='Poultry Health and Flock Management',
         description='إدارة الأمراض في قطعان الدواجن التجارية، برامج التحصين، '
                     'والتعامل مع تفشي المرض.',
         access_type='general', price=300, level='breeders', has_certificate=False,
         objectives=['برامج التحصين وجدولتها', 'التعرف المبكر على تفشي المرض'],
         attach_videos=False),
]

app = create_app()
with app.app_context():
    print('=== target database ===')
    print(' ', str(db.engine.url).replace(db.engine.url.password or '', '***'))
    print()

    # ---- 1. verify the account -------------------------------------------------
    user = User.query.filter_by(email=VERIFY_EMAIL).first()
    if not user:
        print(f'ACCOUNT: {VERIFY_EMAIL} NOT FOUND — nothing to verify')
    elif user.is_baytarian:
        print(f'ACCOUNT: {VERIFY_EMAIL} already verified (no change)')
    else:
        print(f'ACCOUNT: would set is_baytarian=True for {VERIFY_EMAIL} (id={user.id})')
        if APPLY:
            user.is_baytarian = True

    # ---- 2. courses ------------------------------------------------------------
    instructor = User.query.filter_by(role='instructor').first() \
        or User.query.filter(User.headline.isnot(None)).first()
    if not instructor:
        print('\nNo instructor found; cannot create courses.')
        sys.exit(1)
    print(f'\nINSTRUCTOR for demo courses: {instructor.name} (id={instructor.id})')

    categories = {c.slug: c for c in Category.query.all()}
    cat_for = {'demo-bovine-diagnostics': 'large-animals',
               'demo-small-animal-surgery': 'pet-animals',
               'demo-poultry-health': 'poultry'}

    free_videos = Lesson.query.filter(
        Lesson.status == 'published',
        Lesson.vdocipher_video_id.isnot(None),
    ).order_by(Lesson.id).all()
    print(f'PLAYABLE VIDEOS available to attach: {len(free_videos)}')

    for spec in COURSES:
        existing = Course.query.filter_by(slug=spec['slug']).first()
        if existing:
            print(f"  COURSE {spec['slug']}: already exists (id={existing.id}), skipping")
            continue
        cat = categories.get(cat_for[spec['slug']])
        print(f"  COURSE {spec['slug']}: would create "
              f"[{spec['access_type']}, {spec['price']} EGP, cat={cat.slug if cat else None}]"
              + (f" + attach {len(free_videos)} videos" if spec['attach_videos'] else ''))
        if not APPLY:
            continue
        course = Course(
            title=spec['title'], title_en=spec['title_en'], slug=spec['slug'],
            description=spec['description'], price=spec['price'], currency='EGP',
            instructor_id=instructor.id, category_id=cat.id if cat else None,
            access_type=spec['access_type'], status='published',
            level=spec['level'], has_certificate=spec['has_certificate'],
            objectives=spec['objectives'], access_days=None,
        )
        db.session.add(course)
        db.session.flush()
        if spec['attach_videos']:
            for pos, video in enumerate(free_videos):
                db.session.add(CourseVideo(course_id=course.id, video_id=video.id,
                                           position=pos))

    # ---- 3. enrol the verified account on the paid course ----------------------
    # A free course creates no enrolment server-side, so "My courses" needs a paid one.
    # Inserting the row directly avoids taking a real payment for a demo.
    if user:
        paid = Course.query.filter_by(slug='demo-small-animal-surgery').first()
        if paid:
            have = Enrollment.query.filter_by(user_id=user.id, course_id=paid.id).first()
            if have:
                print(f'\nENROLMENT: already enrolled in {paid.slug} (no change)')
            else:
                print(f'\nENROLMENT: would enrol {VERIFY_EMAIL} in {paid.slug}')
                if APPLY:
                    db.session.add(Enrollment(user_id=user.id, course_id=paid.id,
                                              status='active', source='manual'))
        elif APPLY:
            print('\nENROLMENT: paid course not created yet; re-run to enrol')

    if APPLY:
        db.session.commit()
        print('\n*** COMMITTED ***')
    else:
        db.session.rollback()
        print('\n(dry run — nothing written; pass --apply to write)')
