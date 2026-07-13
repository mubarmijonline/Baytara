import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { colors } from '../theme/tokens.js';
import { authPerks } from '../data/mock.js';
import { useAuth } from '../lib/auth.jsx';

export default function Auth() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/dashboard';
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const isSignup = mode === 'signup';
  const title = isSignup ? 'إنشاء حساب جديد' : 'تسجيل الدخول';
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit() {
    setErr(''); setBusy(true);
    try {
      if (isSignup) await register(f.name, f.email, f.password);
      else await login(f.email, f.password);
      navigate(next);
    } catch (e) {
      setErr(
        e.status === 401 ? 'بيانات الدخول غير صحيحة.'
        : e.status === 409 ? 'البريد مسجّل مسبقاً.'
        : e.status === 422 ? 'تحقّق من البيانات (كلمة المرور 8 أحرف على الأقل).'
        : 'تعذّر إتمام العملية.'
      );
      setBusy(false);
    }
  }

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
          background: 'linear-gradient(150deg,#14142b,#2d1730)',
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
            background: 'radial-gradient(circle, rgba(18,40,90,.4), transparent 70%)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, color: colors.muted2, fontSize: 13 }}>
            <span style={{ flex: 1, height: 1, background: '#eee' }} /> أو <span style={{ flex: 1, height: 1, background: '#eee' }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{ flex: 1, border: '1px solid #ddd', background: '#fff', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Google
            </button>
            <button style={{ flex: 1, border: '1px solid #ddd', background: '#fff', borderRadius: 12, padding: 13, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
              Apple
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
