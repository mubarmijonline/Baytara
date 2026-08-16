import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BadgeCheck, Check, Upload, X } from 'lucide-react';
import { Container } from '../components/Primitives.jsx';
import { auth, isAuthed } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { toast } from '../lib/toast.jsx';
import { colors, gradients } from '../theme/tokens.js';

// The order the fields appear on the card, so the read-back reads like the card looks.
const FIELDS = ['name', 'profession', 'registration_no', 'governorate', 'license_no',
  'expires_at', 'national_id', 'is_syndicate_card'];

const card = { background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 16, padding: 22 };

function digits(value) {
  // The card prints Arabic-Indic digits and phones often type them; the API wants ASCII.
  return String(value ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/\D/g, '');
}

function Side({ label, sample, file, onPick }) {
  const input = useRef(null);
  const [preview, setPreview] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>{label}</div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        style={{
          display: 'block', width: '100%', aspectRatio: '8 / 5', padding: 0, cursor: 'pointer',
          border: `2px dashed ${file ? colors.accent : '#d6d9e4'}`, borderRadius: 12,
          overflow: 'hidden', background: `center/cover no-repeat url(${preview || sample})`,
          position: 'relative',
        }}
      >
        {!preview && (
          <span style={{
            position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
            background: 'rgba(255,255,255,.55)', color: colors.accent, fontWeight: 700, fontSize: 13.5,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <Upload size={16} aria-hidden="true" /> {label}
            </span>
          </span>
        )}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }}
        onChange={(event) => onPick(event.target.files?.[0] || null)} />
    </div>
  );
}

function FieldRow({ name, field, t }) {
  const ok = field?.ok;
  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
      background: ok ? '#f2faf5' : '#fdf3f2',
      border: `1px solid ${ok ? '#cfe8da' : '#f0d3d0'}`,
    }}>
      <span aria-hidden="true" style={{ color: ok ? '#1a7f4b' : '#b3261e', display: 'flex' }}>
        {ok ? <Check size={16} strokeWidth={3} /> : <X size={16} strokeWidth={3} />}
      </span>
      <span style={{ flex: '0 0 130px', fontSize: 13, fontWeight: 700, color: colors.ink }}>
        {t(`verify.field.${name}`)}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: ok ? colors.ink2 : '#b3261e' }}>
        {ok ? (field.value === true ? t('verify.ok') : field.value)
          : t(`verify.problem.${field?.problem || 'unreadable'}`)}
      </span>
    </li>
  );
}

export default function VerifyVet() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const [nationalId, setNationalId] = useState('');
  const [savingId, setSavingId] = useState(false);
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthed()) navigate('/auth?next=%2Fverify');
  }, [navigate]);
  useEffect(() => { setNationalId(user?.national_id || ''); }, [user?.national_id]);

  // Reading the card costs a Vision call per attempt, so it runs when both sides are
  // in and not on every keystroke.
  useEffect(() => {
    if (!front || !back || !user?.national_id) { setReport(null); return; }
    let alive = true;
    setBusy(true); setError('');
    auth.baytarianCard(front, back, true)
      .then((response) => alive && setReport(response.report))
      .catch((e) => alive && setError(t(`verify.error.${e.data?.error || 'generic'}`)))
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [front, back, user?.national_id, t]);

  async function saveNationalId(event) {
    event.preventDefault();
    const value = digits(nationalId);
    if (value.length !== 14) { setError(t('verify.error.national_id_length')); return; }
    setSavingId(true); setError('');
    try {
      await updateProfile({ national_id: value });
      toast.success(t('verify.idSaved'));
    } catch (e) {
      const why = e.data?.messages?.national_id?.[0] || 'generic';
      setError(t(`verify.error.${why}`));
    } finally { setSavingId(false); }
  }

  async function submit() {
    setBusy(true); setError('');
    try {
      await auth.baytarianCard(front, back, false);
      toast.success(t('verify.approved'));
      navigate('/dashboard/profile');
    } catch (e) {
      if (e.data?.report) setReport(e.data.report);
      setError(t(`verify.error.${e.data?.error || 'generic'}`));
      setBusy(false);
    }
  }

  if (user?.is_baytarian) {
    return (
      <Container style={{ padding: '48px 24px', maxWidth: 640 }}>
        <section style={{ ...card, display: 'flex', gap: 12, alignItems: 'center' }}>
          <BadgeCheck size={22} aria-hidden="true" style={{ color: '#1a7f4b', flex: 'none' }} />
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700, color: colors.ink }}>
              {t('profile.verifiedTitle')}
            </h1>
            <p style={{ margin: 0, fontSize: 14, color: colors.muted }}>{t('profile.verifiedBody')}</p>
          </div>
        </section>
      </Container>
    );
  }

  const locked = !!user?.national_id;
  const complete = report?.complete;

  return (
    <main style={{ background: colors.surfaceMuted, minHeight: '70vh' }}>
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '40px 0' }}>
        <Container style={{ maxWidth: 720 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 27, fontWeight: 700 }}>{t('verify.title')}</h1>
          <p style={{ margin: 0, fontSize: 15, color: '#b9bfd6', lineHeight: 1.8 }}>{t('verify.subtitle')}</p>
        </Container>
      </div>

      <Container style={{ maxWidth: 720, padding: '24px 24px 70px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Step 1 — the national ID is what ties the card to this account. */}
        <section style={card}>
          <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: colors.ink }}>{t('verify.step1')}</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: colors.muted, lineHeight: 1.8 }}>
            {locked ? t('verify.idLocked') : t('verify.idHint')}
          </p>
          <form onSubmit={saveNationalId} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input
              value={nationalId}
              onChange={(event) => setNationalId(event.target.value)}
              readOnly={locked}
              inputMode="numeric"
              maxLength={14}
              dir="ltr"
              placeholder="27811291801536"
              aria-label={t('verify.field.national_id')}
              style={{
                flex: '1 1 240px', minWidth: 0, height: 46, padding: '0 14px', fontSize: 16,
                letterSpacing: '1px', borderRadius: 10, color: colors.ink,
                border: `1px solid ${colors.line}`, background: locked ? '#f0f1f6' : colors.surfaceMuted,
              }}
            />
            {!locked && (
              <button type="submit" disabled={savingId}
                style={{ flex: 'none', background: colors.accent, color: '#fff', border: 'none', borderRadius: 10, padding: '0 22px', height: 46, fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>
                {savingId ? t('common.loading') : t('verify.saveId')}
              </button>
            )}
          </form>
        </section>

        {/* Step 2 — both sides, with the sample underneath each. */}
        <section style={{ ...card, opacity: locked ? 1 : 0.55, pointerEvents: locked ? 'auto' : 'none' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 700, color: colors.ink }}>{t('verify.step2')}</h2>
          <p style={{ margin: '0 0 14px', fontSize: 13.5, color: colors.muted, lineHeight: 1.8 }}>{t('verify.uploadHint')}</p>
          <div className="grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
            <Side label={t('verify.back')} sample="/images/vet-card-back.png" file={back} onPick={setBack} />
            <Side label={t('verify.front')} sample="/images/vet-card-front.png" file={front} onPick={setFront} />
          </div>
        </section>

        {/* Step 3 — what the machine read, green or red, before anything is committed. */}
        {(busy || report) && (
          <section style={card}>
            <h2 style={{ margin: '0 0 14px', fontSize: 17, fontWeight: 700, color: colors.ink }}>{t('verify.step3')}</h2>
            {busy && !report ? (
              <p style={{ margin: 0, color: colors.muted, fontSize: 14 }}>{t('verify.reading')}</p>
            ) : (
              <>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {FIELDS.map((name) => (
                    <FieldRow key={name} name={name} field={report.fields[name]} t={t} />
                  ))}
                </ul>
                {(report.problems || []).map((problem) => (
                  <p key={problem} role="alert" style={{ margin: '12px 0 0', color: '#b3261e', fontSize: 13.5 }}>
                    {t(`verify.problem.${problem}`)}
                  </p>
                ))}
                <p style={{ margin: '14px 0 0', fontSize: 13, color: colors.muted2, lineHeight: 1.8 }}>
                  {complete ? t('verify.allGreen') : t('verify.retake')}
                </p>
              </>
            )}
          </section>
        )}

        {error && <p role="alert" style={{ margin: 0, color: '#b3261e', fontSize: 14 }}>{error}</p>}

        <button type="button" onClick={submit} disabled={!complete || busy}
          style={{
            background: complete ? colors.accent : '#a7aec9', color: '#fff', border: 'none',
            borderRadius: 12, padding: 15, fontSize: 16, fontWeight: 700,
            cursor: complete && !busy ? 'pointer' : 'default',
          }}>
          {busy ? t('common.loading') : t('verify.submit')}
        </button>
      </Container>
    </main>
  );
}
