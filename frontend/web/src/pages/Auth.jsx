import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '../theme/tokens.js';
import { authPerks } from '../data/mock.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { auth as authApi, getLang } from '../lib/api.js';
import { googleSignInBlocked, loadGoogleIdentity } from '../lib/google.js';

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedNext = params.get('next') || '/dashboard';
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/dashboard';
  const { login, register, loginWithGoogle } = useAuth();
  const { t } = useI18n();
  const [mode, setMode] = useState('login');
  const isSignup = mode === 'signup';
  const title = isSignup ? 'إنشاء حساب جديد' : 'تسجيل الدخول';
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleClientId, setGoogleClientId] = useState('');
  const googleHost = useRef(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // A signed-in student with no phone cannot watch anything (the number is burned
  // into the video watermark), so send them straight to the profile step and come
  // back here-ward afterwards.
  const goAfterAuth = (user) => navigate(
    user && !user.phone ? `/dashboard/profile?next=${encodeURIComponent(next)}` : next
  );

  function showError(e) {
    const code = e.data && e.data.error;
    setErr(
      code === 'device_limit_reached' ? t('devices.limitReached')
      : code === 'account_disabled' ? 'الحساب موقوف.'
      : code === 'google_not_configured' ? 'الدخول بجوجل غير مُهيَّأ حالياً.'
      : code === 'invalid_google_token' ? 'تعذّر التحقّق من حساب جوجل.'
      : e.status === 401 ? 'بيانات الدخول غير صحيحة.'
      : e.status === 409 ? 'البريد مسجّل مسبقاً.'
      : e.status === 422 ? 'تحقّق من البيانات (كلمة المرور 8 أحرف على الأقل).'
      : 'تعذّر إتمام العملية.'
    );
    setBusy(false);
  }

  async function submit() {
    setErr(''); setBusy(true);
    try {
      const user = isSignup
        ? await register(f.name, f.email, f.password, f.phone)
        : await login(f.email, f.password);
      goAfterAuth(user);
    } catch (e) {
      showError(e);
    }
  }

  // Google sign-in is available only once the API reports a client id.
  useEffect(() => {
    if (googleSignInBlocked()) return;
    let live = true;
    authApi.googleConfig()
      .then((r) => { if (live) setGoogleClientId(r.client_id || ''); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (!googleClientId) return;
    let live = true;
    loadGoogleIdentity().then(() => {
      if (!live || !googleHost.current) return;
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setErr(''); setBusy(true);
          try {
            goAfterAuth(await loginWithGoogle(credential));
          } catch (e) {
            showError(e);
          }
        },
      });
      googleHost.current.innerHTML = '';  // renderButton appends; don't stack on re-render
      window.google.accounts.id.renderButton(googleHost.current, {
        theme: 'outline', size: 'large', shape: 'pill', width: 340, locale: getLang(),
        text: isSignup ? 'signup_with' : 'signin_with',
      });
    }).catch(() => { if (live) setGoogleClientId(''); });
    return () => { live = false; };
  }, [googleClientId, isSignup]);

  const tab = (active, label, onClick) => (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        border: 'none',
        borderRadius: 9,
        padding: 11,
        fontSize: 15,
        fontWeight: 800,
        cursor: 'pointer',
        background: active ? '#fff' : 'transparent',
        color: active ? colors.ink : colors.muted,
      }}
    >
      {label}
    </button>
  );

  const field = (label, input) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{label}</label>
      {input}
    </div>
  );

  const inputStyle = {
    width: '100%',
    border: '1px solid #ddd',
    borderRadius: 12,
    padding: '14px 16px',
    fontSize: 15,
    outline: 'none',
  };

  return (
    <div className="grid-collapse-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 620 }}>
      {/* Left panel */}
      <div
        className="hide-md"
        style={{
          background: 'linear-gradient(150deg,#1E2A5E,#16255C)',
          color: '#fff',
          padding: 60,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -80,
            left: -60,
            width: 300,
            height: 300,
            background: 'radial-gradient(circle, rgba(48,72,160,.4), transparent 70%)',
            filter: 'blur(20px)',
          }}
        />
        <div style={{ position: 'relative' }}>
          <div style={{ fontWeight: 800, fontSize: 30, marginBottom: 26 }}>
            بيطرة<span style={{ color: colors.accent }}>.</span>
          </div>
          <h2 style={{ fontSize: 34, fontWeight: 900, lineHeight: 1.3, margin: '0 0 18px' }}>
            انضم لأكثر من مليوني متعلّم بيطري عربي
          </h2>
          <p style={{ fontSize: 17, color: '#c9c9dc', lineHeight: 1.7, margin: '0 0 30px', maxWidth: 380 }}>
            وصول غير محدود لآلاف الدورات، مسارات تعليمية مصمّمة لك، وشهادات معتمدة.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {authPerks.map((p) => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15 }}>
                <span
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: colors.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 900,
                    flex: 'none',
                  }}
                >
                  ✓
                </span>{' '}
                {p}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 50 }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <div style={{ display: 'flex', background: colors.surfaceAlt, borderRadius: 12, padding: 5, marginBottom: 28 }}>
            {tab(!isSignup, 'تسجيل الدخول', () => setMode('login'))}
            {tab(isSignup, 'حساب جديد', () => setMode('signup'))}
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 22px' }}>{title}</h2>
          {isSignup && field('الاسم الكامل', <input placeholder="أدخل اسمك" style={inputStyle} value={f.name} onChange={set('name')} />)}
          {field('البريد الإلكتروني', <input placeholder="you@email.com" style={inputStyle} value={f.email} onChange={set('email')} />)}
          {isSignup && field(t('auth.phone'),
            <>
              <input required placeholder="+2010xxxxxxxx" style={inputStyle} value={f.phone} onChange={set('phone')} />
              <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>{t('auth.phoneHint')}</div>
            </>)}
          {field('كلمة المرور', <input type="password" placeholder="••••••••" style={inputStyle} value={f.password} onChange={set('password')} onKeyDown={(e) => e.key === 'Enter' && submit()} />)}
          {err && <div style={{ color: colors.accent, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{err}</div>}
          <button
            onClick={submit}
            disabled={busy}
            style={{
              width: '100%',
              background: colors.accent,
              border: 'none',
              borderRadius: 12,
              color: '#fff',
              fontSize: 16,
              fontWeight: 800,
              padding: 15,
              cursor: 'pointer',
              marginBottom: 18,
              opacity: busy ? 0.6 : 1,
            }}
          >
            {busy ? '…' : title}
          </button>
          {googleClientId && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, color: colors.muted2, fontSize: 13 }}>
                <span style={{ flex: 1, height: 1, background: '#eee' }} /> أو <span style={{ flex: 1, height: 1, background: '#eee' }} />
              </div>
              <div ref={googleHost} data-testid="google-signin" style={{ display: 'flex', justifyContent: 'center' }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
