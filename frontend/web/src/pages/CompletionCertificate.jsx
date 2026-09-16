// The attendance certificate. Name, course and date -- and nothing else.
//
// The client asked for it "بدون QR كود ولا تعقيدات، بالاسم فقط", so unlike the verified
// certificate there is no QR code, no serial on the sheet and no "this is genuine" line.
// It is printed with the browser's own print, the same as the other one.
import { useParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import NotFound from './NotFound.jsx';
import { colors, font } from '../theme/tokens.js';
import { webapi, useFetch } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

export default function CompletionCertificate() {
  const { serial } = useParams();
  const { t, lang } = useI18n();
  const { data, error, loading } = useFetch(() => webapi.completionCertificate(serial), [serial]);

  if (loading) return <Container style={{ padding: '40px 24px', color: colors.muted }}>{t('common.loading')}</Container>;
  if (error || !data?.completion_certificate) return <NotFound />;

  const certificate = data.completion_certificate;
  const issued = certificate.issued_at
    ? new Date(certificate.issued_at).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-EG',
      { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  return (
    <div style={{ background: colors.surfaceMuted, padding: '40px 0 60px' }}>
      <Container style={{ maxWidth: 820 }}>
        {/* A light sheet on purpose: at a glance it must not pass for the verified one. */}
        <article className="certificate-sheet" style={{ background: '#fff', color: colors.ink,
          border: `2px solid ${colors.gold}`, borderRadius: 20, padding: '52px 48px', textAlign: 'center' }}>
          <img src="/brand/logo-blue.png" alt="بيطرة BAYTARA" style={{ height: 44, marginBottom: 26 }}
            onError={(event) => { event.currentTarget.style.display = 'none'; }} />
          <div style={{ fontFamily: font, fontSize: 13, letterSpacing: 2, color: colors.gold, fontWeight: 700 }}>
            CERTIFICATE OF COMPLETION
          </div>
          <div style={{ fontSize: 15, color: colors.muted, margin: '6px 0 22px' }}>{t('completion.title')}</div>
          <p style={{ margin: '0 0 10px', fontSize: 15, color: colors.muted }}>{t('completion.awardedTo')}</p>
          <h1 style={{ margin: '0 0 22px', fontSize: 34, fontWeight: 700 }}>{certificate.learner_name}</h1>
          <p style={{ margin: '0 0 10px', fontSize: 15, color: colors.muted }}>{t('completion.forAttending')}</p>
          <h2 style={{ margin: '0 0 26px', fontSize: 23, fontWeight: 700, color: colors.accent }}>{certificate.course?.title}</h2>
          <div style={{ fontSize: 13, color: colors.muted2 }}>{issued}</div>
        </article>

        <div className="certificate-actions" style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
          <button type="button" onClick={() => window.print()}
            style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 11,
              fontSize: 15, fontWeight: 700, padding: '13px 26px', cursor: 'pointer' }}>
            {t('certificate.download')}
          </button>
        </div>
      </Container>
    </div>
  );
}
