// حاسبة قياسات السونار التناسلي (milestone 29).
//
// The client's calculator (docs/reference/Baytara_sonar_v5.html), in Baytara's brand and
// behind sign-in. The formulas live on the server (backend/app/services/sonar.py): this
// page only collects measurements and shows what came back, so a visitor who is not signed
// in has neither the tool nor its formulas. Every case is saved to the account.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CalendarDays, ClipboardCopy, MessageCircle, Trash2, TriangleAlert } from 'lucide-react';
import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import { colors } from '../theme/tokens.js';
import { auth } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';

const SPECIES = ['bovine', 'buffalo', 'equine', 'ovine', 'caprine'];
const MEASURES = ['vesicle', 'eye_orbit', 'crl', 'bpd', 'hl', 'trunk', 'placentome'];

const COPY = {
  ar: {
    breadcrumb: 'الرئيسية › الأدوات › حاسبة السونار',
    title: 'حاسبة قياسات السونار التناسلي',
    subtitle: 'احسب عمر الحمل وميعاد الولادة المتوقع من قياسات السونار، واحتفظ بسجل حالاتك في حسابك.',
    species: { bovine: 'الأبقار', buffalo: 'الجاموس', equine: 'الخيول', ovine: 'الأغنام', caprine: 'الماعز' },
    measures: {
      vesicle: 'قطر الحويصلة / كيس الحمل GSD', eye_orbit: 'محجر العين Eye', crl: 'طول الجنين CRL',
      bpd: 'قطر الرأس BPD', hl: 'طول الرأس HL', trunk: 'قطر الجذع Trunk', placentome: 'الفلقيات Placentomes',
    },
    equineVesicle: 'الحويصلة EV',
    short: { vesicle: 'GSD', eye_orbit: 'العين', crl: 'CRL', bpd: 'BPD', hl: 'HL', trunk: 'الجذع', placentome: 'الفلقيات' },
    equineShort: 'EV',
    label: 'رقم / اسم الحالة (اختياري)', labelPh: 'مثال: بقرة رقم 45',
    examDate: 'تاريخ الفحص',
    hint: 'أدخل قياساً واحداً على الأقل بالمليمتر. كل قياس إضافي يزيد دقة التقدير.',
    calc: 'احسب العمر وسجّل الحالة', working: 'جارٍ الحساب…',
    result: 'النتيجة', age: 'متوسط العمر التقديري',
    days: (n) => `${n} يوم`, ageLine: (m, d) => (m === 0 ? 'أقل من شهر' : `${m} شهر و ${d} يوم`),
    expected: 'ميعاد الولادة المتوقع', atTerm: 'مكتمل النمو / على وشك الولادة',
    remaining: (n, g) => `متبقٍ ${n} يوم من مدة حمل ${g} يوم`,
    range: (a, b) => `التقديرات بين ${a} و ${b} يوم`,
    beyond: 'أكبر من مدة الحمل كاملة: راجع هذا القياس',
    perMeasure: 'التقدير لكل قياس',
    copy: 'نسخ التقرير', copied: 'تم نسخ التقرير.', share: 'إرسال على واتساب',
    history: 'سجل الحالات', noHistory: 'لا توجد حالات محفوظة بعد.', more: 'عرض المزيد',
    del: 'حذف', clear: 'مسح السجل كله', clearConfirm: 'مسح كل الحالات المحفوظة؟ لا يمكن التراجع.',
    noLabel: 'بدون رقم',
    reportTitle: 'تقرير فحص السونار التناسلي - منصة بيطرة',
    reportLine: (label, sp, age, months, birth) => `• حالة (${label}) [${sp}] -> العمر: ${age} يوم (${months}) | الولادة: ${birth}`,
    gateTitle: 'الحاسبة متاحة لأعضاء بيطرة',
    gateBody: 'سجّل الدخول أو أنشئ حساباً مجانياً لاستخدام الحاسبة وحفظ حالاتك والرجوع لها من الموقع أو التطبيق.',
    signIn: 'تسجيل الدخول', register: 'إنشاء حساب مجاني',
    disclaimer: 'النتائج تقديرية للمساعدة، ولا تغني عن تقدير الطبيب البيطري للحالة.',
    errors: {
      no_measurements: 'أدخل قياساً واحداً على الأقل.',
      out_of_range: 'قيمة غير منطقية: يجب أن تكون أكبر من صفر وحتى 1000 مم.',
      bad_number: 'أدخل رقماً صحيحاً.', bad_date: 'تاريخ الفحص لا يمكن أن يكون في المستقبل.',
      generic: 'تعذّر الحساب. حاول مرة أخرى.',
    },
  },
  en: {
    breadcrumb: 'Home › Tools › Ultrasound calculator',
    title: 'Reproductive ultrasound calculator',
    subtitle: 'Estimate gestational age and the expected birth date from ultrasound measurements, and keep your cases in your account.',
    species: { bovine: 'Cattle', buffalo: 'Buffalo', equine: 'Horses', ovine: 'Sheep', caprine: 'Goats' },
    measures: {
      vesicle: 'Vesicle / gestational sac GSD', eye_orbit: 'Eye orbit', crl: 'Crown-rump length CRL',
      bpd: 'Biparietal diameter BPD', hl: 'Head length HL', trunk: 'Trunk diameter', placentome: 'Placentomes',
    },
    equineVesicle: 'Embryonic vesicle EV',
    short: { vesicle: 'GSD', eye_orbit: 'Eye', crl: 'CRL', bpd: 'BPD', hl: 'HL', trunk: 'Trunk', placentome: 'Placentome' },
    equineShort: 'EV',
    label: 'Case number / name (optional)', labelPh: 'e.g. cow 45',
    examDate: 'Exam date',
    hint: 'Enter at least one measurement in millimetres. Each extra one improves the estimate.',
    calc: 'Calculate and save the case', working: 'Calculating…',
    result: 'Result', age: 'Estimated average age',
    days: (n) => `${n} days`, ageLine: (m, d) => (m === 0 ? 'under a month' : `${m} months ${d} days`),
    expected: 'Expected birth', atTerm: 'At term / about to give birth',
    remaining: (n, g) => `${n} days left of a ${g}-day gestation`,
    range: (a, b) => `Estimates range from ${a} to ${b} days`,
    beyond: 'Longer than a full gestation: check this measurement',
    perMeasure: 'Estimate per measurement',
    copy: 'Copy report', copied: 'Report copied.', share: 'Send on WhatsApp',
    history: 'Case history', noHistory: 'No saved cases yet.', more: 'Show more',
    del: 'Delete', clear: 'Clear all history', clearConfirm: 'Delete every saved case? This cannot be undone.',
    noLabel: 'unnamed',
    reportTitle: 'Reproductive ultrasound report - Baytara',
    reportLine: (label, sp, age, months, birth) => `• Case (${label}) [${sp}] -> age: ${age} days (${months}) | birth: ${birth}`,
    gateTitle: 'The calculator is for Baytara members',
    gateBody: 'Sign in or create a free account to use the calculator, save your cases and open them again on the website or in the app.',
    signIn: 'Sign in', register: 'Create a free account',
    disclaimer: 'Results are estimates to assist you and do not replace a veterinarian’s judgement of the case.',
    errors: {
      no_measurements: 'Enter at least one measurement.',
      out_of_range: 'That value is not plausible: it must be above zero and at most 1000 mm.',
      bad_number: 'Enter a valid number.', bad_date: 'The exam date cannot be in the future.',
      generic: 'Could not calculate. Try again.',
    },
  },
};

const card = { background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 16, padding: 20 };
const input = { width: '100%', height: 46, border: '1.5px solid #d6d9e4', borderRadius: 10, padding: '0 12px', fontSize: 15, boxSizing: 'border-box', background: '#fff', color: colors.ink };
const danger = '#b3261e';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(iso, lang) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function reportText(exams, c, lang) {
  const lines = exams.map((e) => {
    const r = e.result;
    const birth = r.at_term ? c.atTerm : formatDate(r.expected_birth, lang);
    return c.reportLine(e.label || c.noLabel, c.species[e.species], r.age_days, c.ageLine(r.months, r.extra_days), birth);
  });
  return `${c.reportTitle}:\n\n${lines.join('\n')}`;
}

function measureName(c, species, m, short) {
  if (m === 'vesicle' && species === 'equine') return short ? c.equineShort : c.equineVesicle;
  return short ? c.short[m] : c.measures[m];
}

function ResultCard({ exam, c, lang, highlight }) {
  const r = exam.result;
  return (
    <div style={{ ...card, borderColor: highlight ? colors.accent : colors.line, borderWidth: highlight ? 2 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div>
          <span style={{ background: colors.accentSoft, color: colors.accent, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8 }}>{c.species[exam.species]}</span>
          <strong style={{ marginInlineStart: 10, color: colors.ink, fontSize: 16 }}>{exam.label || c.noLabel}</strong>
        </div>
        <span style={{ fontSize: 12, color: colors.muted2 }}>{formatDate(exam.exam_date, lang)}</span>
      </div>
      <div style={{ background: 'linear-gradient(120deg,#1B2A66,#3048A0)', color: '#fff', borderRadius: 12, padding: '14px 16px', marginBottom: 12 }}>
        <div style={{ fontSize: 12.5, color: '#c9d2f2' }}>{c.age}</div>
        <div style={{ fontSize: 26, fontWeight: 900, margin: '2px 0' }}>{c.days(r.age_days)} <span style={{ fontSize: 15, fontWeight: 600, color: colors.gold }}>({c.ageLine(r.months, r.extra_days)})</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, marginTop: 6 }}>
          <CalendarDays size={16} aria-hidden="true" color={colors.gold} />
          <span>{c.expected}: <b>{r.at_term ? c.atTerm : formatDate(r.expected_birth, lang)}</b></span>
        </div>
        {!r.at_term && <div style={{ fontSize: 12.5, color: '#c9d2f2', marginTop: 4 }}>{c.remaining(r.days_remaining, r.gestation_days)}</div>}
      </div>
      {r.per_measure.length > 1 && (
        <div style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>{c.range(r.range_days[0], r.range_days[1])}</div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }} aria-label={c.perMeasure}>
        {r.per_measure.map((m) => (
          <span key={m.measure} title={m.beyond_term ? c.beyond : undefined}
            style={{ fontSize: 12.5, border: `1px solid ${m.beyond_term ? danger : colors.line}`, color: m.beyond_term ? danger : colors.ink2, background: m.beyond_term ? '#fdf0ef' : colors.surfaceMuted, borderRadius: 8, padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {m.beyond_term && <TriangleAlert size={13} aria-hidden="true" />}
            {measureName(c, exam.species, m.measure, true)}: {m.mm}mm <b style={{ color: m.beyond_term ? danger : colors.accent }}>({c.days(m.age_days)})</b>
          </span>
        ))}
      </div>
      {r.per_measure.some((m) => m.beyond_term) && (
        <p role="note" style={{ color: danger, fontSize: 13, margin: '8px 0 0' }}>{c.beyond}</p>
      )}
    </div>
  );
}

function SignInGate({ c }) {
  return (
    <div style={{ ...card, textAlign: 'center', padding: '34px 22px' }}>
      <Activity size={34} color={colors.accent} aria-hidden="true" />
      <h2 style={{ fontSize: 21, fontWeight: 900, color: colors.ink, margin: '10px 0 8px' }}>{c.gateTitle}</h2>
      <p style={{ fontSize: 15, color: colors.muted, lineHeight: 1.9, maxWidth: 520, margin: '0 auto 18px' }}>{c.gateBody}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link to="/auth?mode=signup&next=/tools/sonar" style={{ background: colors.accent, color: '#fff', fontWeight: 700, padding: '12px 22px', borderRadius: 10, textDecoration: 'none' }}>{c.register}</Link>
        <Link to="/auth?next=/tools/sonar" style={{ border: `1.5px solid ${colors.accent}`, color: colors.accent, fontWeight: 700, padding: '11px 22px', borderRadius: 10, textDecoration: 'none' }}>{c.signIn}</Link>
      </div>
    </div>
  );
}

export default function SonarCalculator() {
  const { lang } = useI18n();
  const c = COPY[lang === 'en' ? 'en' : 'ar'];
  const { user, loading } = useAuth();
  const [species, setSpecies] = useState('bovine');
  const [label, setLabel] = useState('');
  const [examDate, setExamDate] = useState(today());
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);
  const [more, setMore] = useState(false);
  const [notice, setNotice] = useState('');

  const fields = useMemo(() => MEASURES.filter((m) => !(species === 'equine' && m === 'placentome')), [species]);

  useEffect(() => {
    if (!user) return;
    auth.sonarHistory().then((r) => { setHistory(r.exams || []); setMore(!!r.more); }).catch(() => {});
  }, [user]);

  if (loading) return null;

  async function calculate(event) {
    event.preventDefault();
    const measures = {};
    fields.forEach((m) => { if (values[m] !== undefined && values[m] !== '') measures[m] = Number(values[m]); });
    if (!Object.values(measures).some((v) => v > 0)) { setError(c.errors.no_measurements); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { exam } = await auth.sonarCalculate({ species, label, exam_date: examDate, measures });
      setLatest(exam);
      setHistory((h) => [exam, ...h]);
      setValues({}); setLabel('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      const code = e?.data?.error;
      setError(c.errors[code] || c.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function remove(exam) {
    await auth.sonarDelete(exam.id).catch(() => {});
    setHistory((h) => h.filter((x) => x.id !== exam.id));
    if (latest?.id === exam.id) setLatest(null);
  }

  async function clearAll() {
    if (!window.confirm(c.clearConfirm)) return;
    await auth.sonarClear().catch(() => {});
    setHistory([]); setLatest(null); setMore(false);
  }

  async function loadMore() {
    const r = await auth.sonarHistory(history[history.length - 1]?.id).catch(() => null);
    if (r) { setHistory((h) => [...h, ...(r.exams || [])]); setMore(!!r.more); }
  }

  async function copyReport() {
    try { await navigator.clipboard.writeText(reportText(history, c, lang)); setNotice(c.copied); }
    catch { setNotice(''); }
  }

  const shareUrl = `https://wa.me/?text=${encodeURIComponent(reportText(latest ? [latest] : history.slice(0, 10), c, lang))}`;

  return (
    <div>
      <PageHero breadcrumb={c.breadcrumb} title={c.title} subtitle={c.subtitle} />
      <Container style={{ padding: '34px 24px 60px', maxWidth: 1100 }}>
        {!user ? <SignInGate c={c} /> : (
          <div className="sonar-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 22, alignItems: 'start' }}>
            <form onSubmit={calculate} style={card} noValidate>
              <div role="radiogroup" aria-label={c.title} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {SPECIES.map((s) => (
                  <button key={s} type="button" role="radio" aria-checked={species === s} onClick={() => setSpecies(s)}
                    style={{ border: `1.5px solid ${species === s ? colors.accent : '#d6d9e4'}`, background: species === s ? colors.accent : '#fff', color: species === s ? '#fff' : colors.ink, borderRadius: 100, padding: '8px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
                    {c.species[s]}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 6 }}>{c.label}</span>
                  <input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder={c.labelPh} style={input} />
                </label>
                <label style={{ display: 'block' }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink, marginBottom: 6 }}>{c.examDate}</span>
                  <input type="date" value={examDate} max={today()} onChange={(e) => setExamDate(e.target.value || today())} style={input} />
                </label>
              </div>
              <p style={{ fontSize: 13, color: colors.muted, margin: '4px 0 12px' }}>{c.hint}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {fields.map((m) => (
                  <label key={m} style={{ display: 'block', gridColumn: m === 'vesicle' && species !== 'equine' ? '1 / -1' : undefined }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: colors.ink2, marginBottom: 6 }}>{measureName(c, species, m, false)} (mm)</span>
                    <input type="number" inputMode="decimal" min="0" max="1000" step="any" dir="ltr" placeholder="0"
                      value={values[m] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
                      style={{ ...input, textAlign: 'center' }} />
                  </label>
                ))}
              </div>
              {error && <p role="alert" style={{ color: danger, fontSize: 14, margin: '12px 0 0' }}>{error}</p>}
              <button type="submit" disabled={busy}
                style={{ width: '100%', marginTop: 16, background: colors.accent, color: '#fff', border: 'none', borderRadius: 12, padding: '14px 18px', fontSize: 16, fontWeight: 800, cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? c.working : c.calc}
              </button>
              <p style={{ fontSize: 12, color: colors.muted2, margin: '12px 0 0', lineHeight: 1.8 }}>{c.disclaimer}</p>
            </form>

            <div style={{ display: 'grid', gap: 16 }}>
              {latest && (
                <section aria-live="polite">
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: colors.ink, margin: '0 0 10px' }}>{c.result}</h2>
                  <ResultCard exam={latest} c={c} lang={lang} highlight />
                </section>
              )}
              <section>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 800, color: colors.ink, margin: 0 }}>{c.history}</h2>
                  {history.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" onClick={copyReport} style={smallBtn}><ClipboardCopy size={14} aria-hidden="true" /> {c.copy}</button>
                      <a href={shareUrl} target="_blank" rel="noopener noreferrer" style={{ ...smallBtn, textDecoration: 'none' }}><MessageCircle size={14} aria-hidden="true" /> {c.share}</a>
                      <button type="button" onClick={clearAll} style={{ ...smallBtn, color: danger, borderColor: '#f0c9c5' }}><Trash2 size={14} aria-hidden="true" /> {c.clear}</button>
                    </div>
                  )}
                </div>
                {notice && <p role="status" style={{ color: '#1a7f4b', fontSize: 13, margin: '0 0 8px' }}>{notice}</p>}
                {!history.length && <div style={{ ...card, color: colors.muted, textAlign: 'center' }}>{c.noHistory}</div>}
                <div style={{ display: 'grid', gap: 12 }}>
                  {history.filter((e) => e.id !== latest?.id).map((exam) => (
                    <div key={exam.id} style={{ position: 'relative' }}>
                      <ResultCard exam={exam} c={c} lang={lang} />
                      <button type="button" onClick={() => remove(exam)} aria-label={`${c.del} ${exam.label || c.noLabel}`}
                        style={{ position: 'absolute', insetInlineEnd: 12, bottom: 12, border: 'none', background: 'transparent', color: colors.muted2, cursor: 'pointer' }}>
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
                {more && <button type="button" onClick={loadMore} style={{ ...smallBtn, marginTop: 12 }}>{c.more}</button>}
              </section>
            </div>
          </div>
        )}
      </Container>
    </div>
  );
}

const smallBtn = {
  display: 'inline-flex', alignItems: 'center', gap: 6, border: '1.5px solid #d6d9e4', background: '#fff',
  color: colors.ink, fontSize: 13, fontWeight: 700, padding: '7px 12px', borderRadius: 9, cursor: 'pointer',
};
