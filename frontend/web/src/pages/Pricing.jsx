import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Clock, Lock, Unlock } from 'lucide-react';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { auth } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';

// The four access rules the API actually enforces (services/catalog_access.py), in the
// order a visitor meets them: what anyone can watch, then what verification opens, then
// what is paid. `general` is the odd one — it is the paid tier for people who are not
// vets, and a verified vet is refused it, so it is described that way and not as
// "paid, open to everyone".
const TIERS = [
  { key: 'free', icon: Unlock, tone: '#1a7f4b', needsVerification: false },
  { key: 'vet_free', icon: BadgeCheck, tone: '#2b6cb0', needsVerification: true },
  { key: 'baytarian', icon: Lock, tone: '#C8A24B', needsVerification: true },
  { key: 'general', icon: Lock, tone: '#575E7D', needsVerification: false },
];

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useI18n();
  const [state, setState] = useState(null); // {is_baytarian, request}

  useEffect(() => {
    if (!user) { setState(null); return; }
    auth.baytarianMe().then(setState).catch(() => {});
  }, [user]);

  const card = { background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 18, padding: 22 };
  const verified = state?.is_baytarian || user?.is_baytarian;
  const pending = state?.request?.status === 'pending';
  const rejected = state?.request?.status === 'rejected';

  const cta = (label, onClick, tone = colors.accent) => (
    <button type="button" onClick={onClick}
      style={{ background: tone, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700,
        fontSize: 15, padding: '13px 26px', cursor: 'pointer', alignSelf: 'flex-start' }}>
      {label}
    </button>
  );

  return (
    <div style={{ background: colors.surfaceMuted, minHeight: '70vh' }}>
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '46px 0' }}>
        <Container>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>{t('membership.title')}</h1>
          <p style={{ color: '#c9c9dc', marginTop: 8, fontSize: 17, lineHeight: 1.8, maxWidth: 640 }}>
            {t('membership.subtitle')}
          </p>
        </Container>
      </div>

      <Container style={{ padding: '32px 24px 60px', maxWidth: 1000 }}>
        {/* Said before the tiers, because "is any of this free?" is the first question. */}
        <section style={{ ...card, borderInlineStart: `4px solid #1a7f4b`, marginBottom: 26,
          display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          <Unlock size={22} aria-hidden="true" style={{ color: '#1a7f4b', flex: 'none', marginTop: 2 }} />
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: colors.ink }}>
              {t('membership.freeTitle')}
            </h2>
            <p style={{ margin: 0, fontSize: 14.5, color: colors.ink2, lineHeight: 1.9 }}>
              {t('membership.freeBody')}
            </p>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))', gap: 18, marginBottom: 34 }}>
          {TIERS.map(({ key, icon: Icon, tone, needsVerification }) => (
            <div key={key} style={{ ...card, borderTop: `4px solid ${tone}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Icon size={18} aria-hidden="true" style={{ color: tone }} />
              <div style={{ fontSize: 16.5, fontWeight: 800, color: tone }}>{t(`access.${key}`)}</div>
              <p style={{ fontSize: 14, color: colors.ink2, lineHeight: 1.8, margin: 0, flex: 1 }}>
                {t(`membership.tier.${key}`)}
              </p>
              {needsVerification && !verified && (
                <button type="button" onClick={() => navigate('/verify')}
                  style={{ background: 'none', border: 'none', padding: 0, textAlign: 'inherit', font: 'inherit',
                    color: colors.accent, fontWeight: 700, fontSize: 13.5, cursor: 'pointer' }}>
                  {t('membership.verifyToOpen')}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Verification: one block, whose whole content is decided by where the visitor
            already stands. Documents are uploaded on /verify, never here. */}
        <section style={{ ...card, borderTop: `4px solid ${colors.accent}`, padding: 26 }}>
          <h2 style={{ fontSize: 21, fontWeight: 800, margin: '0 0 6px', color: colors.ink }}>
            {t('membership.becomeTitle')}
          </h2>
          <p style={{ color: colors.ink2, fontSize: 15, lineHeight: 1.9, margin: '0 0 18px', maxWidth: 640 }}>
            {t('membership.becomeDesc')}
          </p>

          {verified ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '14px 18px',
              background: '#e8f5ee', color: '#1a7f4b', borderRadius: 12, fontWeight: 700 }}>
              <BadgeCheck size={20} aria-hidden="true" /> {t('membership.approved')}
            </div>
          ) : pending ? (
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 18px',
              background: '#fdf6e3', color: '#7a6320', borderRadius: 12 }}>
              <Clock size={20} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700 }}>{t('membership.pending')}</div>
                <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.8 }}>{t('membership.pendingHint')}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {rejected && state?.request?.reject_reason && (
                <div style={{ padding: '12px 16px', background: '#fdecea', color: '#b3261e', borderRadius: 10, fontSize: 14, lineHeight: 1.8 }}>
                  {t('membership.rejected')}: {state.request.reject_reason}
                </div>
              )}
              <ol style={{ margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {['step1', 'step2', 'step3'].map((step) => (
                  <li key={step} style={{ fontSize: 14.5, color: colors.ink2, lineHeight: 1.9 }}>
                    {t(`membership.${step}`)}
                  </li>
                ))}
              </ol>
              {user
                ? cta(t('membership.verify'), () => navigate('/verify'))
                : cta(t('membership.loginFirst'), () => navigate('/auth?next=%2Fverify'))}
            </div>
          )}
        </section>
      </Container>
    </div>
  );
}
