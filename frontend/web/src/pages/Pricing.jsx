import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { auth } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { toast } from '../lib/toast.jsx';

const TIER_KEYS = ['free', 'vet_free', 'baytarian', 'general'];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState(null); // {is_baytarian, request}
  const [files, setFiles] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = () => user && auth.baytarianMe().then(setState).catch(() => {});
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  async function submit() {
    if (!files.length) { toast.error(t('membership.upload')); return; }
    setBusy(true);
    try {
      await auth.baytarianRequest(files, note);
      setFiles([]); setNote(''); if (fileRef.current) fileRef.current.value = '';
      toast.success(t('membership.pending'));
      load();
    } catch (e) {
      toast.error(e.data?.error === 'request_pending' ? t('membership.pending') : 'تعذّر الإرسال');
    } finally { setBusy(false); }
  }

  const card = { background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 18, padding: 24 };
  const tierColor = { free: '#1a7f4b', vet_free: '#2b6cb0', baytarian: colors.accent, general: '#575E7D' };
  const status = state?.request?.status;
  const verified = state?.is_baytarian;

  return (
    <div style={{ background: colors.surfaceMuted, minHeight: '70vh' }}>
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '46px 0' }}>
        <Container>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: 0 }}>{t('membership.title')}</h1>
          <p style={{ color: '#c9c9dc', marginTop: 8, fontSize: 17 }}>{t('membership.subtitle')}</p>
        </Container>
      </div>

      <Container style={{ padding: '32px 24px 60px', maxWidth: 1000 }}>
        {/* 4 access tiers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 18, marginBottom: 40 }}>
          {TIER_KEYS.map((k) => (
            <div key={k} style={{ ...card, borderTop: `4px solid ${tierColor[k]}` }}>
              <div style={{ fontSize: 17, fontWeight: 900, marginBottom: 8, color: tierColor[k] }}>{t('access.' + k)}</div>
              <p style={{ fontSize: 14, color: colors.ink2, lineHeight: 1.7, margin: 0 }}>
                {k === 'free' && (t('lang.name') === 'English' ? 'Open to everyone, no payment.' : 'متاح للجميع بدون دفع.')}
                {k === 'vet_free' && t('lock.instructors_only')}
                {k === 'baytarian' && t('lock.needs_baytarian')}
                {k === 'general' && (t('lang.name') === 'English' ? 'Paid, open to everyone.' : 'مدفوع ومتاح للجميع.')}
              </p>
            </div>
          ))}
        </div>

        {/* Become a Baytarian */}
        <div style={{ ...card, borderTop: `4px solid ${colors.accent}` }}>
          <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 6px' }}>{t('membership.becomeTitle')}</h2>
          <p style={{ color: colors.ink2, fontSize: 15, lineHeight: 1.7, marginTop: 0 }}>{t('membership.becomeDesc')}</p>

          {!user ? (
            <button onClick={() => navigate('/auth?next=/pricing')}
              style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, padding: '12px 24px', cursor: 'pointer' }}>
              {t('membership.loginFirst')}
            </button>
          ) : verified ? (
            <div style={{ padding: '14px 18px', background: '#e8f5ee', color: '#1a7f4b', borderRadius: 12, fontWeight: 800 }}>
              {t('membership.approved')}
            </div>
          ) : status === 'pending' ? (
            <div style={{ padding: '14px 18px', background: '#fdf6e3', color: '#5e5524', borderRadius: 12, fontWeight: 800 }}>
              {t('membership.pending')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 520 }}>
              {status === 'rejected' && state?.request?.reject_reason && (
                <div style={{ padding: '10px 14px', background: '#fdecea', color: '#b3261e', borderRadius: 10, fontSize: 14 }}>
                  {t('membership.rejected')}: {state.request.reject_reason}
                </div>
              )}
              <label style={{ fontSize: 14, fontWeight: 800 }}>{t('membership.upload')}</label>
              <input ref={fileRef} type="file" multiple accept="image/*,application/pdf"
                onChange={(e) => setFiles(Array.from(e.target.files))}
                style={{ border: `1px solid ${colors.line}`, borderRadius: 10, padding: 10 }} />
              <input placeholder={t('membership.note')} value={note} onChange={(e) => setNote(e.target.value)}
                style={{ border: `1px solid ${colors.line}`, borderRadius: 10, padding: '12px 14px', fontSize: 15 }} />
              <button onClick={submit} disabled={busy}
                style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, padding: '13px 26px', cursor: 'pointer', opacity: busy ? 0.6 : 1, alignSelf: 'flex-start' }}>
                {busy ? '…' : t('membership.submit')}
              </button>
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
