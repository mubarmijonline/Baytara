import { useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { dashNav, dashStats, inProgress, rawCourses } from '../data/mock.js';

export default function Dashboard() {
  const navigate = useNavigate();
  const recommended = rawCourses.slice(5, 8);

  return (
    <div style={{ background: colors.surfaceMuted, minHeight: 620 }}>
      <Container
        className="grid-collapse-2"
        style={{ padding: '40px 24px 60px', display: 'grid', gridTemplateColumns: '230px 1fr', gap: 30, alignItems: 'start' }}
      >
        {/* Sidebar */}
        <aside
          className="hide-md"
          style={{ background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 18, padding: 20, position: 'sticky', top: 90 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 18, borderBottom: `1px solid ${colors.line2}`, marginBottom: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                background: gradients.avatar,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              م
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800 }}>مرحباً، محمود</div>
              <div style={{ fontSize: 12, color: colors.muted2 }}>عضو مميّز</div>
            </div>
          </div>
          {dashNav.map((n) => (
            <div
              key={n.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 12px',
                borderRadius: 10,
                fontSize: 14,
                fontWeight: n.active ? 800 : 600,
                color: n.active ? colors.accent : colors.ink2,
                background: n.active ? colors.accentSoft : 'transparent',
                cursor: 'pointer',
                marginBottom: 2,
              }}
            >
              <span>{n.icon}</span> {n.label}
            </div>
          ))}
        </aside>

        <div>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: '0 0 6px' }}>أهلاً بعودتك، محمود 👋</h1>
          <p style={{ color: colors.muted, fontSize: 16, margin: '0 0 26px' }}>
            لديك 3 دورات قيد التقدّم. واصل من حيث توقّفت.
          </p>

          <div
            className="grid-collapse-sm"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 30 }}
          >
            {dashStats.map((s) => (
              <div key={s.label} style={{ background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 16, padding: 20 }}>
                <div style={{ fontSize: 28, fontWeight: 900, color: s.color }}>{s.num}</div>
                <div style={{ fontSize: 13, color: colors.muted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 16px' }}>واصل التعلّم</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 34 }}>
            {inProgress.map((c, i) => (
              <div
                key={i}
                onClick={() => navigate(`/learn/${c.id}/0-0`)}
                style={{
                  background: '#fff',
                  border: `1px solid ${colors.line}`,
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  cursor: 'pointer',
                }}
              >
                <div
                  className="hide-sm"
                  style={{
                    width: 120,
                    height: 74,
                    borderRadius: 12,
                    background: c.grad,
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      width: 0,
                      height: 0,
                      borderTop: '8px solid transparent',
                      borderBottom: '8px solid transparent',
                      borderRight: '13px solid rgba(255,255,255,.9)',
                      marginRight: -3,
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: colors.muted2, marginBottom: 4 }}>
                    {c.cat} · {c.instructor}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>{c.title}</div>
                  <div style={{ height: 7, background: '#f0f0f4', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: c.progress, background: colors.accent, borderRadius: 100 }} />
                  </div>
                  <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>
                    اكتمل {c.progress} · {c.remaining}
                  </div>
                </div>
                <button
                  className="hide-sm"
                  style={{
                    background: colors.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 800,
                    padding: '11px 20px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  متابعة
                </button>
              </div>
            ))}
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 16px' }}>موصى به لك</h2>
          <div
            className="grid-collapse-sm"
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}
          >
            {recommended.map((c) => (
              <div
                key={c.id}
                className="hover-lift"
                onClick={() => navigate(`/courses/${c.slug}`)}
                style={{ background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 16, overflow: 'hidden', cursor: 'pointer' }}
              >
                <div style={{ height: 120, background: c.grad }} />
                <div style={{ padding: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.4, marginBottom: 6 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: colors.muted2 }}>
                    {c.instructor} · ★ {c.rating}
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
