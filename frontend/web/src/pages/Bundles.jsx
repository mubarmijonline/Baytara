import { useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { webapi, useFetch } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

export default function Bundles() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { data, loading } = useFetch(() => webapi.bundles(), []);
  const bundles = data?.bundles || [];

  const card = { background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 18, padding: 22,
    boxShadow: '0 8px 30px rgba(30,42,94,.05)', display: 'flex', flexDirection: 'column', gap: 12 };
  const btn = { background: colors.accent, border: 'none', borderRadius: 12, color: '#fff', fontSize: 15,
    fontWeight: 800, padding: '11px 22px', cursor: 'pointer' };

  return (
    <div style={{ background: colors.surfaceMuted, minHeight: '70vh' }}>
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '40px 0' }}>
        <Container>
          <h1 style={{ fontSize: 30, fontWeight: 900, margin: 0 }}>{t('bundles.title')}</h1>
          <p style={{ color: '#c9c9dc', marginTop: 8, fontSize: 16 }}>{t('bundles.subtitle')}</p>
        </Container>
      </div>

      <Container style={{ padding: '32px 24px 60px' }}>
        {loading ? (
          <div style={{ color: colors.muted }}>{t('common.loading')}</div>
        ) : bundles.length === 0 ? (
          <div style={{ color: colors.muted, fontSize: 15 }}>{t('bundles.empty')}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 20 }}>
            {bundles.map((b) => {
              const total = Number(b.courses_total || 0);
              const price = Number(b.price || 0);
              const save = total > price ? Math.round((1 - price / total) * 100) : 0;
              return (
                <div key={b.id} style={card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <h3 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>{b.title}</h3>
                    {save > 0 && (
                      <span style={{ background: '#e8f5ee', color: '#1a7f4b', fontWeight: 800, fontSize: 13,
                        borderRadius: 20, padding: '4px 12px', flex: 'none' }}>{t('bundles.save')} {save}%</span>
                    )}
                  </div>
                  {b.description && <p style={{ margin: 0, color: colors.ink2, fontSize: 14, lineHeight: 1.7 }}>{b.description}</p>}
                  <div style={{ fontSize: 13, color: colors.muted }}>
                    {t('bundles.contains')} {b.courses?.length || 0} {t('bundles.courses')}
                  </div>
                  <ul style={{ margin: 0, paddingInlineStart: 18, color: colors.ink2, fontSize: 14 }}>
                    {(b.courses || []).slice(0, 5).map((c) => <li key={c.id} style={{ marginBottom: 4 }}>{c.title}</li>)}
                  </ul>
                  <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8 }}>
                    <div>
                      <span style={{ fontSize: 22, fontWeight: 900, color: colors.accent }}>{price} {b.currency}</span>
                      {save > 0 && <span style={{ fontSize: 14, color: colors.muted, textDecoration: 'line-through', marginInlineStart: 8 }}>{total}</span>}
                    </div>
                    <button onClick={() => navigate(`/buy/${b.slug}?type=bundle`)} style={btn}>{t('bundles.buy')}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Container>
    </div>
  );
}
