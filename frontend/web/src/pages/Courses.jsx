import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients, layout } from '../theme/tokens.js';
import { rawCourses, categories, levels, ratingFilters } from '../data/mock.js';
import { webapi, mapCourse, useFetch } from '../lib/api.js';

export default function Courses() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');

  const { data: coursesData } = useFetch(() => webapi.courses({ per_page: 50 }), []);
  const { data: catsData } = useFetch(() => webapi.categories(), []);

  // Real API data when present; otherwise the approved mock catalog (keeps the design full).
  const apiCourses = coursesData?.courses?.length ? coursesData.courses.map(mapCourse) : null;
  const allCourses = apiCourses || [];
  const catList = catsData?.categories?.length
    ? catsData.categories.map((c) => ({ name: c.name, count: undefined }))
    : categories;

  const filterCats = [{ key: 'all', name: 'كل التخصّصات', count: 2000 }].concat(
    catList.map((c) => ({ key: c.name, name: c.name, count: c.count })),
  );

  const visible = filter === 'all' ? allCourses : allCourses.filter((c) => c.cat === filter);
  const catalog = visible.length ? visible : allCourses;

  return (
    <div>
      {/* Page hero */}
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '46px 0' }}>
        <Container>
          <div style={{ fontSize: 13, color: '#b6b6cc', marginBottom: 10 }}>الرئيسية › الدورات</div>
          <h1 style={{ fontSize: 38, fontWeight: 900, margin: '0 0 8px' }}>استكشف كل الدورات</h1>
          <p style={{ fontSize: 17, color: '#c9c9dc', margin: 0 }}>
            أكثر من 2000 دورة في 19 تخصّصاً بيطرياً — اعثر على ما يناسب هدفك.
          </p>
        </Container>
      </div>

      <Container
        className="grid-collapse-2"
        style={{ padding: '30px 24px 60px', display: 'grid', gridTemplateColumns: '260px 1fr', gap: 30, alignItems: 'start' }}
      >
        {/* Filters */}
        <aside
          className="hide-md"
          style={{ border: `1px solid ${colors.line}`, borderRadius: 18, padding: 22, position: 'sticky', top: 90 }}
        >
          <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 18 }}>تصفية النتائج</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: colors.muted, marginBottom: 12 }}>التخصّص</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 24 }}>
            {filterCats.map((f) => {
              const active = filter === f.key;
              return (
                <div
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '9px 12px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: active ? 800 : 500,
                    color: active ? colors.accent : colors.ink2,
                    background: active ? colors.accentSoft : 'transparent',
                  }}
                >
                  <span>{f.name}</span>
                  <span style={{ fontSize: 12, color: colors.muted2 }}>{f.count}</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: colors.muted, marginBottom: 12 }}>المستوى</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {levels.map((lv) => (
              <label key={lv} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <span style={{ width: 18, height: 18, border: '2px solid #ccc', borderRadius: 5 }} />
                {lv}
              </label>
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: colors.muted, marginBottom: 12 }}>التقييم</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ratingFilters.map((r) => (
              <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <span style={{ width: 18, height: 18, border: '2px solid #ccc', borderRadius: '50%' }} />
                <span style={{ color: colors.star }}>★</span> {r} فأعلى
              </label>
            ))}
          </div>
        </aside>

        {/* Grid */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <span style={{ fontSize: 15, color: colors.muted }}>
              عرض <b style={{ color: colors.ink }}>{catalog.length}</b> دورة
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <span className="hide-sm" style={{ color: colors.muted }}>
                ترتيب حسب:
              </span>
              <span style={{ border: '1px solid #ddd', borderRadius: 10, padding: '9px 14px', fontWeight: 700, cursor: 'pointer' }}>
                الأكثر رواجاً ▾
              </span>
            </div>
          </div>
          <div
            className="grid-collapse-sm"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}
          >
            {catalog.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: colors.muted, padding: '50px 0' }}>
                لا توجد دورات منشورة بعد.
              </div>
            )}
            {catalog.map((c) => (
              <div
                key={c.id}
                className="hover-lift"
                onClick={() => navigate(`/courses/${c.slug}`)}
                style={{ border: `1px solid ${colors.line}`, borderRadius: 16, overflow: 'hidden', background: '#fff', cursor: 'pointer' }}
              >
                <div style={{ height: 150, background: c.grad, position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      background: 'rgba(0,0,0,.55)',
                      color: '#fff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '5px 10px',
                      borderRadius: 100,
                    }}
                  >
                    {c.cat}
                  </span>
                </div>
                <div style={{ padding: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.4, margin: '0 0 8px', minHeight: 45 }}>{c.title}</h3>
                  <div style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }}>{c.instructor}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: colors.muted }}>
                    <span style={{ color: colors.star, fontWeight: 800 }}>★ {c.rating}</span>
                    <span>·</span>
                    <span>{c.lessons} درس</span>
                    <span>·</span>
                    <span>{c.hours} ساعة</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
