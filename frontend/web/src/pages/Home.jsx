import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, SectionHeading } from '../components/Primitives.jsx';
import CourseCard from '../components/CourseCard.jsx';
import { colors, gradients, layout } from '../theme/tokens.js';
import {
  stats,
  categories,
  rawCourses,
  bizStats,
  rawInstructors,
  testimonials,
} from '../data/mock.js';
import { webapi, mapCourse, useFetch, useSettings } from '../lib/api.js';

function Hero() {
  const navigate = useNavigate();
  const settings = useSettings();
  const hero = settings.hero || {};
  return (
    <section style={{ position: 'relative', background: gradients.hero, color: '#fff', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: -120,
          left: -80,
          width: 380,
          height: 380,
          background: 'radial-gradient(circle, rgba(233,190,67,.40), transparent 70%)',
          filter: 'blur(20px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -140,
          right: -60,
          width: 340,
          height: 340,
          background: 'radial-gradient(circle, rgba(67,86,166,.35), transparent 70%)',
          filter: 'blur(20px)',
        }}
      />
      <Container
        className="grid-collapse-2"
        style={{
          padding: '72px 24px 80px',
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '1.1fr .9fr',
          gap: 48,
          alignItems: 'center',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,.1)',
              border: '1px solid rgba(255,255,255,.16)',
              padding: '7px 14px',
              borderRadius: 100,
              fontSize: 13,
              fontWeight: 700,
              marginBottom: 22,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors.accent }} />
            منصة التعلّم البيطري الأولى عربياً
          </div>
          <h1 style={{ fontSize: 52, lineHeight: 1.15, fontWeight: 900, margin: '0 0 20px', letterSpacing: '-1px' }}>
            {hero.title || (
              <>
                تعلّم من نخبة الأطباء
                <br />
                البيطريين في العالم العربي
              </>
            )}
          </h1>
          <p style={{ fontSize: 19, lineHeight: 1.7, color: '#c9c9dc', margin: '0 0 32px', maxWidth: 520 }}>
            {hero.subtitle ||
              'آلاف الدورات في الطب البيطري والإنتاج الحيواني والتشخيص والجراحة، بمحتوى عربي أصيل من خبراء حقيقيين — تعلّم في أي وقت ومن أي مكان.'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 34, flexWrap: 'wrap' }}>
            <button
              className="hover-bright"
              onClick={() => navigate('/courses')}
              style={{
                background: colors.accent,
                border: 'none',
                borderRadius: 12,
                fontSize: 17,
                fontWeight: 800,
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 34px',
              }}
            >
              ابدأ التعلّم مجاناً
            </button>
            <button
              style={{
                background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(255,255,255,.2)',
                borderRadius: 12,
                fontSize: 17,
                fontWeight: 700,
                color: '#fff',
                cursor: 'pointer',
                padding: '16px 28px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                  borderRight: '10px solid #fff',
                }}
              />
              شاهد كيف تعمل
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 26, fontSize: 14, color: '#a9a9c2', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: colors.star, fontSize: 16 }}>★</span> تقييم 4.8 من 5
            </span>
            <span>مشاهدة على جميع الأجهزة</span>
            <span>شهادات معتمدة</span>
          </div>
        </div>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              aspectRatio: '4 / 3',
              borderRadius: 20,
              background: 'linear-gradient(160deg, #3048A0, #24357A)',
              border: '1px solid rgba(255,255,255,.12)',
              boxShadow: '0 30px 70px rgba(0,0,0,.4)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: '50%',
                  background: colors.accent,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 12px 34px rgba(48,72,160,.5)',
                }}
              >
                <span
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: '12px solid transparent',
                    borderBottom: '12px solid transparent',
                    borderRight: '20px solid #fff',
                    marginRight: -4,
                  }}
                />
              </div>
            </div>
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                left: 0,
                padding: '18px 20px',
                background: 'linear-gradient(transparent, rgba(0,0,0,.55))',
              }}
            >
              <div style={{ fontSize: 13, color: '#F5D877', fontWeight: 700 }}>دورة مميّزة</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>جراحة الحيوانات الصغيرة</div>
            </div>
          </div>
          <div
            className="hide-sm"
            style={{
              position: 'absolute',
              top: 12,
              right: -18,
              background: '#fff',
              color: colors.ink,
              borderRadius: 14,
              padding: '12px 16px',
              boxShadow: '0 14px 34px rgba(0,0,0,.25)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: gradients.accentCta }} />
            <div>
              <div style={{ fontSize: 12, color: colors.muted }}>أكملت اليوم</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>‏3 دروس</div>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

function StatsBand() {
  const settings = useSettings();
  const list = Array.isArray(settings.stats) && settings.stats.length ? settings.stats : [];
  return (
    <section style={{ background: '#fff', borderBottom: `1px solid ${colors.line}` }}>
      <Container
        className="grid-collapse-sm"
        style={{ padding: '34px 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}
      >
        {list.map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 34, fontWeight: 900, color: colors.ink }}>{s.num}</div>
            <div style={{ fontSize: 15, color: colors.muted, fontWeight: 500, marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </Container>
    </section>
  );
}

function Carousel({ title, badge, courses, markNew }) {
  const rowRef = useRef(null);
  const scroll = (dir) => rowRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  const arrowStyle = {
    width: 42,
    height: 42,
    borderRadius: '50%',
    border: '1px solid #ddd',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 18,
    color: colors.ink,
  };
  return (
    <Container style={{ padding: '46px 24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <h2 style={{ fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: '-.5px' }}>{title}</h2>
          {badge && (
            <span
              style={{
                background: colors.accentSoft,
                color: colors.accent,
                fontSize: 12,
                fontWeight: 800,
                padding: '5px 11px',
                borderRadius: 100,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={arrowStyle} onClick={() => scroll(1)}>
            ›
          </button>
          <button style={arrowStyle} onClick={() => scroll(-1)}>
            ‹
          </button>
        </div>
      </div>
      <div
        ref={rowRef}
        style={{ display: 'flex', gap: 20, overflowX: 'auto', scrollBehavior: 'smooth', paddingBottom: 8 }}
      >
        {courses.map((c) => (
          <CourseCard key={c.id} course={c} isNew={markNew} />
        ))}
      </div>
    </Container>
  );
}

function BusinessBanner() {
  const navigate = useNavigate();
  return (
    <Container style={{ margin: '44px auto', padding: '0 24px' }}>
      <div
        className="grid-collapse-2"
        style={{
          background: gradients.darkPanel,
          borderRadius: 24,
          padding: '48px 52px',
          color: '#fff',
          display: 'grid',
          gridTemplateColumns: '1.2fr .8fr',
          gap: 40,
          alignItems: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: -40,
            width: 240,
            height: 240,
            background: 'radial-gradient(circle, rgba(233,190,67,.35), transparent 70%)',
            filter: 'blur(10px)',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: colors.accent, letterSpacing: 1, marginBottom: 12 }}>
            BAYTARA FOR BUSINESS
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 900, margin: '0 0 14px', lineHeight: 1.25 }}>
            طوّر مهارات فريقك الطبي بالكامل
          </h2>
          <p style={{ fontSize: 17, color: '#c9c9dc', margin: '0 0 26px', lineHeight: 1.7, maxWidth: 460 }}>
            حلول تدريب متكاملة للعيادات والمزارع مع لوحة تحكم لمتابعة تقدّم الفريق وتقارير أداء تفصيلية.
          </p>
          <button
            onClick={() => navigate('/business')}
            style={{
              background: '#fff',
              color: colors.ink,
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 800,
              padding: '15px 30px',
              cursor: 'pointer',
            }}
          >
            اطلب عرضاً تجريبياً
          </button>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {bizStats.map((b) => (
            <div
              key={b.label}
              style={{
                background: 'rgba(255,255,255,.07)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 14,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 26, fontWeight: 900 }}>{b.num}</div>
              <div style={{ fontSize: 13, color: '#b6b6cc' }}>{b.label}</div>
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}

function InstructorsSection() {
  const navigate = useNavigate();
  const { data } = useFetch(() => webapi.instructors(), []);
  const list = data?.instructors?.length
    ? data.instructors.map((m, i) => ({
        id: m.id, name: m.name, title: m.headline || 'مدرّب معتمد',
        ini: (m.name || '؟').trim().charAt(0), grad: rawInstructors[i % rawInstructors.length].grad,
        courses: m.courses, students: '—',
      }))
    : [];
  return (
    <section style={{ background: colors.surfaceMuted, marginTop: 44 }}>
      <Container style={{ padding: '56px 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 38 }}>
          <h2 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 8px', letterSpacing: '-.5px' }}>
            تعلّم على يد نخبة من الأطباء
          </h2>
          <p style={{ margin: 0, color: colors.muted, fontSize: 16 }}>
            أكثر من 700 طبيب ومدرّب من رواد كل تخصّص بيطري في العالم العربي
          </p>
        </div>
        <div
          className="grid-collapse-sm"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 20 }}
        >
          {list.map((m) => (
            <div
              key={m.id}
              className="hover-lift"
              onClick={() => navigate(`/instructors/${m.id}`)}
              style={{
                background: '#fff',
                border: `1px solid ${colors.line}`,
                borderRadius: 18,
                padding: '26px 18px',
                textAlign: 'center',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: '50%',
                  margin: '0 auto 16px',
                  background: m.grad,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 30,
                  fontWeight: 900,
                }}
              >
                {m.ini}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 3 }}>{m.name}</div>
              <div style={{ fontSize: 13, color: colors.muted, marginBottom: 12, lineHeight: 1.4 }}>{m.title}</div>
              <div style={{ fontSize: 12, color: colors.muted2, paddingTop: 12, borderTop: `1px solid ${colors.line2}` }}>
                {m.courses} دورة · {m.students} متعلّم
              </div>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

function Testimonials() {
  const settings = useSettings();
  const list = Array.isArray(settings.testimonials) && settings.testimonials.length
    ? settings.testimonials.map((t, i) => ({
        quote: t.quote || t.text || '', name: t.name, role: t.role,
        ini: (t.name || '؟').trim().charAt(0), grad: testimonials[i % testimonials.length].grad,
      }))
    : [];
  return (
    <Container style={{ padding: '60px 24px' }}>
      <h2 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 34px', textAlign: 'center', letterSpacing: '-.5px' }}>
        ماذا يقول متعلّمونا
      </h2>
      <div
        className="grid-collapse-sm"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 22 }}
      >
        {list.map((t) => (
          <div
            key={t.name}
            style={{ background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 18, padding: 28 }}
          >
            <div style={{ color: colors.star, fontSize: 15, marginBottom: 14 }}>★★★★★</div>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: colors.ink2, margin: '0 0 20px' }}>{t.quote}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: t.grad,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 800,
                }}
              >
                {t.ini}
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{t.name}</div>
                <div style={{ fontSize: 13, color: colors.muted2 }}>{t.role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}

function FinalCta() {
  const navigate = useNavigate();
  return (
    <Container style={{ margin: '0 auto 60px', padding: '0 24px' }}>
      <div
        style={{
          background: gradients.accentCta,
          borderRadius: 24,
          padding: 52,
          color: '#fff',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,.18), transparent 40%)',
          }}
        />
        <div style={{ position: 'relative' }}>
          <h2 style={{ fontSize: 36, fontWeight: 900, margin: '0 0 14px' }}>ابدأ رحلة تعلّمك اليوم</h2>
          <p style={{ fontSize: 18, margin: '0 auto 30px', maxWidth: 560, opacity: 0.95, lineHeight: 1.7 }}>
            اشترك الآن واحصل على وصول غير محدود لكل الدورات والمسارات التعليمية عبر جميع أجهزتك.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate('/pricing')}
              style={{
                background: '#fff',
                color: colors.ink,
                border: 'none',
                borderRadius: 12,
                fontSize: 17,
                fontWeight: 800,
                padding: '16px 34px',
                cursor: 'pointer',
              }}
            >
              اشترك الآن
            </button>
            <button
              style={{
                background: 'rgba(255,255,255,.16)',
                color: '#fff',
                border: '1.5px solid rgba(255,255,255,.5)',
                borderRadius: 12,
                fontSize: 17,
                fontWeight: 700,
                padding: '16px 30px',
                cursor: 'pointer',
              }}
            >
              حمّل التطبيق
            </button>
          </div>
        </div>
      </div>
    </Container>
  );
}

function CategoriesSection() {
  const navigate = useNavigate();
  const { data } = useFetch(() => webapi.categories(), []);
  const list = data?.categories?.length
    ? data.categories.map((c, i) => ({
        name: c.name, slug: c.slug, count: categories[i % categories.length].count,
        bg: categories[i % categories.length].bg, letter: (c.name || '؟').trim().charAt(0),
      }))
    : [];
  return (
    <Container style={{ padding: '56px 24px 20px' }}>
      <SectionHeading
        title="تصفّح حسب التخصّص"
        subtitle="اختر التخصّص الذي يناسب أهدافك وابدأ رحلتك"
        action={
          <span
            onClick={() => navigate('/courses')}
            style={{ color: colors.accent, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
          >
            عرض كل التخصّصات ←
          </span>
        }
      />
      <div
        className="grid-collapse-sm"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}
      >
        {list.map((c) => (
          <div
            key={c.name}
            className="hover-card"
            onClick={() => navigate('/courses')}
            style={{ border: `1px solid ${colors.line}`, borderRadius: 16, padding: 22, cursor: 'pointer', background: '#fff' }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                background: c.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
                fontSize: 22,
                fontWeight: 900,
                color: '#fff',
              }}
            >
              {c.letter}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{c.name}</div>
            <div style={{ fontSize: 13, color: colors.muted2 }}>{c.count} دورة</div>
          </div>
        ))}
      </div>
    </Container>
  );
}

export default function Home() {
  const { data } = useFetch(() => webapi.courses({ per_page: 12 }), []);
  const apiCourses = data?.courses?.length ? data.courses.map(mapCourse) : null;
  const trending = apiCourses ? apiCourses.slice(0, 5) : [];
  const recent = apiCourses ? apiCourses.slice(5, 10) : [];
  return (
    <>
      <Hero />
      <StatsBand />
      <CategoriesSection />
      {trending.length > 0 && <Carousel title="الأكثر رواجاً هذا الأسبوع" badge="🔥 رائج" courses={trending} />}
      <BusinessBanner />
      {recent.length > 0 && <Carousel title="أضيفت حديثاً" courses={recent} markNew />}
      <InstructorsSection />
      <Testimonials />
      <FinalCta />
    </>
  );
}
