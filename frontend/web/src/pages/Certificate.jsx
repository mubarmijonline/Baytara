import { useParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import NotFound from './NotFound.jsx';
import { colors, font, gradients } from '../theme/tokens.js';
import { webapi, useFetch } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

// Public certificate. The same page verifies the serial and is what «تحميل PDF»
// prints — the browser's own print-to-PDF, rather than a PDF library on the server.
export default function Certificate() {
  const { serial } = useParams();
  const { t, lang } = useI18n();
  const { data, error, loading } = useFetch(() => webapi.certificate(serial), [serial]);

  if (loading) return <Container style={{ padding: '40px 24px', color: colors.muted }}>{t('common.loading')}</Container>;
  if (error || !data?.certificate) return <NotFound />;

  const certificate = data.certificate;
  const issued = certificate.issued_at
    ? new Date(certificate.issued_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-EG',
      { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div style={{ background: colors.surfaceMuted, padding: '40px 0 60px' }}>
      <Container style={{ maxWidth: 820 }}>
        <article className="certificate-sheet" style={{ background: gradients.darkPanel, color: '#fff', borderRadius: 20, padding: '52px 48px', textAlign: 'center' }}>
          <img src="/brand/logo-white.png" alt="بيطرة BAYTARA" style={{ height: 44, marginBottom: 28 }} />
          <div style={{ fontFamily: font, fontSize: 12, letterSpacing: 2, color: colors.gold, marginBottom: 18 }}>
            {t('certificate.title')}
          </div>
          <p style={{ margin: '0 0 10px', fontSize: 15, color: '#b9bfd6' }}>{t('certificate.awardedTo')}</p>
          <h1 style={{ margin: '0 0 22px', fontSize: 34, fontWeight: 700 }}>{certificate.learner_name}</h1>
          <p style={{ margin: '0 0 10px', fontSize: 15, color: '#b9bfd6' }}>{t('certificate.forCompleting')}</p>
          <h2 style={{ margin: '0 0 28px', fontSize: 24, fontWeight: 700, color: colors.gold }}>{certificate.course?.title}</h2>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 26, flexWrap: 'wrap', fontSize: 13, color: '#a7aec9' }}>
            <span>{issued}</span>
            <span style={{ fontFamily: font }}>{certificate.serial}</span>
          </div>
        </article>

        <div className="certificate-actions" style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => window.print()}
            style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 11, fontSize: 15, fontWeight: 700, padding: '13px 26px', cursor: 'pointer' }}>
            {t('certificate.download')}
          </button>
        </div>
        <p className="certificate-actions" style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: colors.muted2 }}>
          {t('certificate.verified')}
        </p>
      </Container>
    </div>
  );
}
