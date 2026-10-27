// حاسبة قياسات السونار التناسلي (milestone 29).
//
// The client's calculator (docs/reference/Baytara_sonar_v5.html), in Baytara's brand and
// behind sign-in. The formulas live on the server (backend/app/services/sonar.py): this
// page only collects measurements and shows what came back, so a visitor who is not signed
// in has neither the tool nor its formulas. Every case is saved to the account.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ClipboardCopy, MessageCircle, Trash2, TriangleAlert } from 'lucide-react';
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
    gestation: (n) => `حمل ${n} يوم`,
    groupSac: 'الحويصلة والفلقيات', groupSacEquine: 'الحويصلة', groupFetus: 'قياسات الجنين',
    progress: (p) => `${p}% من مدة الحمل`,
    conception: 'الإخصاب التقريبي', examDay: 'يوم الفحص', birthDay: 'الولادة المتوقعة',
    emptyTitle: 'ستظهر النتيجة هنا',
    steps: ['اختر الفصيلة', 'أدخل قياساً واحداً أو أكثر بالمليمتر', 'احصل على العمر وميعاد الولادة. سيتم حفظ الحالة في حسابك، ويمكنك مسح السجل في أي وقت'],
    gestationRef: 'مدة الحمل المعتمدة في الحاسبة',
    cols: { case: 'الحالة', species: 'الفصيلة', exam: 'تاريخ الفحص', age: 'العمر', birth: 'الولادة المتوقعة', measures: 'القياسات' },
    count: (n) => `${n} حالة`,
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
    gestation: (n) => `${n}-day gestation`,
    groupSac: 'Vesicle and placentomes', groupSacEquine: 'Vesicle', groupFetus: 'Fetal measurements',
    progress: (p) => `${p}% of gestation`,
    conception: 'Approx. conception', examDay: 'Exam day', birthDay: 'Expected birth',
    emptyTitle: 'Your result appears here',
    steps: ['Choose the species', 'Enter one or more measurements in mm', 'Get the age and expected birth. The case is saved to your account, and you can clear your history at any time'],
    gestationRef: 'Gestation lengths used by the calculator',
    cols: { case: 'Case', species: 'Species', exam: 'Exam date', age: 'Age', birth: 'Expected birth', measures: 'Measurements' },
    count: (n) => `${n} case(s)`,
    errors: {
      no_measurements: 'Enter at least one measurement.',
      out_of_range: 'That value is not plausible: it must be above zero and at most 1000 mm.',
      bad_number: 'Enter a valid number.', bad_date: 'The exam date cannot be in the future.',
      generic: 'Could not calculate. Try again.',
    },
  },
};

// Gestation lengths the server uses (services/sonar.py GESTATION_DAYS), shown as reference
// and on the species picker. Display only: every number in a result comes from the server.
const GESTATION = { bovine: 283, buffalo: 310, equine: 340, ovine: 150, caprine: 150 };
const SAC = ['vesicle', 'placentome'];
const FETUS = ['eye_orbit', 'crl', 'bpd', 'hl', 'trunk'];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDays(iso, days) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
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

function MeasureChips({ exam, c }) {
  return (
    <div className="sonar-chips" aria-label={c.perMeasure}>
      {exam.result.per_measure.map((m) => (
        <span key={m.measure} className={`sonar-chip${m.beyond_term ? ' is-bad' : ''}`} title={m.beyond_term ? c.beyond : undefined}>
          {m.beyond_term && <TriangleAlert size={13} aria-hidden="true" />}
          {measureName(c, exam.species, m.measure, true)} {m.mm}mm <b>({c.days(m.age_days)})</b>
        </span>
      ))}
    </div>
  );
}

function ResultPanel({ exam, c, lang }) {
  const r = exam.result;
  const pct = Math.min(100, Math.round((r.age_days / r.gestation_days) * 100));
  const conception = shiftDays(r.exam_date, -r.age_days);
  return (
    <div className="sonar-result" aria-live="polite">
      <div className="sonar-result-head">
        <span className="sonar-pill">{c.species[exam.species]}</span>
        <strong>{exam.label || c.noLabel}</strong>
      </div>
      <div className="sonar-result-label">{c.age}</div>
      <div className="sonar-result-age">
        {c.days(r.age_days)} <span>{c.ageLine(r.months, r.extra_days)}</span>
      </div>
      <div className="sonar-progress" role="img" aria-label={c.progress(pct)}>
        <div className="sonar-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="sonar-progress-text">{c.progress(pct)}</div>
      <ol className="sonar-timeline">
        <li><span>{c.conception}</span><b>{formatDate(conception, lang)}</b></li>
        <li className="is-now"><span>{c.examDay}</span><b>{formatDate(r.exam_date, lang)}</b></li>
        <li className="is-goal">
          <span>{c.birthDay}</span>
          <b>{r.at_term ? c.atTerm : formatDate(r.expected_birth, lang)}</b>
          {!r.at_term && <small>{c.remaining(r.days_remaining, r.gestation_days)}</small>}
        </li>
      </ol>
      <div className="sonar-result-foot">
        {r.per_measure.length > 1 && <p className="sonar-range">{c.range(r.range_days[0], r.range_days[1])}</p>}
        <MeasureChips exam={exam} c={c} />
        {r.per_measure.some((m) => m.beyond_term) && <p role="note" className="sonar-warn">{c.beyond}</p>}
      </div>
    </div>
  );
}

function EmptyPanel({ c }) {
  return (
    <div className="sonar-result is-empty">
      <Activity size={30} color={colors.gold} aria-hidden="true" />
      <h2>{c.emptyTitle}</h2>
      <ol className="sonar-steps">
        {c.steps.map((s, i) => <li key={s}><span>{i + 1}</span>{s}</li>)}
      </ol>
      <div className="sonar-ref">
        <div className="sonar-ref-title">{c.gestationRef}</div>
        <div className="sonar-ref-grid">
          {SPECIES.map((s) => <div key={s}><span>{c.species[s]}</span><b>{c.days(GESTATION[s])}</b></div>)}
        </div>
      </div>
    </div>
  );
}

function SignInGate({ c }) {
  return (
    <div className="sonar-gate">
      <Activity size={34} color={colors.accent} aria-hidden="true" />
      <h2>{c.gateTitle}</h2>
      <p>{c.gateBody}</p>
      <div className="sonar-gate-actions">
        <Link to="/auth?mode=signup&next=/tools/sonar" className="sonar-btn">{c.register}</Link>
        <Link to="/auth?next=/tools/sonar" className="sonar-btn is-outline">{c.signIn}</Link>
      </div>
    </div>
  );
}

function HistoryTable({ history, c, lang, onDelete }) {
  return (
    <div className="sonar-table-wrap">
      <table className="sonar-table">
        <thead>
          <tr>
            <th>{c.cols.case}</th><th>{c.cols.species}</th><th>{c.cols.exam}</th>
            <th>{c.cols.age}</th><th>{c.cols.birth}</th><th>{c.cols.measures}</th><th aria-label={c.del} />
          </tr>
        </thead>
        <tbody>
          {history.map((exam) => {
            const r = exam.result;
            return (
              <tr key={exam.id}>
                <td data-label={c.cols.case}><strong>{exam.label || c.noLabel}</strong></td>
                <td data-label={c.cols.species}><span className="sonar-pill">{c.species[exam.species]}</span></td>
                <td data-label={c.cols.exam}>{formatDate(exam.exam_date, lang)}</td>
                <td data-label={c.cols.age}><b>{c.days(r.age_days)}</b><small>{c.ageLine(r.months, r.extra_days)}</small></td>
                <td data-label={c.cols.birth}>{r.at_term ? c.atTerm : formatDate(r.expected_birth, lang)}</td>
                <td data-label={c.cols.measures}><MeasureChips exam={exam} c={c} /></td>
                <td>
                  <button type="button" className="sonar-icon-btn" onClick={() => onDelete(exam)} aria-label={`${c.del} ${exam.label || c.noLabel}`}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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

  const field = (m) => (
    <label key={m} className="sonar-field">
      <span>{measureName(c, species, m, false)} (mm)</span>
      <div className="sonar-input-unit">
        <input type="number" inputMode="decimal" min="0" max="1000" step="any" dir="ltr" placeholder="0"
          aria-label={`${measureName(c, species, m, false)} (mm)`}
          value={values[m] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))} />
        <em aria-hidden="true">mm</em>
      </div>
    </label>
  );

  return (
    <div className="sonar-page">
      <PageHero breadcrumb={c.breadcrumb} title={c.title} subtitle={c.subtitle} />
      <Container style={{ padding: '36px 24px 64px' }}>
        {!user ? <SignInGate c={c} /> : (
          <>
            <div className="sonar-workspace">
              <form onSubmit={calculate} className="sonar-card sonar-form" noValidate>
                <div role="radiogroup" aria-label={c.title} className="sonar-species">
                  {SPECIES.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={species === s} aria-label={c.species[s]}
                      className={`sonar-species-tile${species === s ? ' is-on' : ''}`} onClick={() => setSpecies(s)}>
                      <b>{c.species[s]}</b>
                      <small>{c.gestation(GESTATION[s])}</small>
                    </button>
                  ))}
                </div>

                <div className="sonar-row">
                  <label className="sonar-field">
                    <span>{c.label}</span>
                    <input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder={c.labelPh} />
                  </label>
                  <label className="sonar-field">
                    <span>{c.examDate}</span>
                    <input type="date" value={examDate} max={today()} onChange={(e) => { setExamDate(e.target.value || today()); setError(''); }} />
                  </label>
                </div>

                <p className="sonar-hint">{c.hint}</p>

                <fieldset className="sonar-group">
                  {/* Horses have no placentomes, so their group is the vesicle alone. */}
                  <legend>{species === 'equine' ? c.groupSacEquine : c.groupSac}</legend>
                  <div className="sonar-row">{SAC.filter((m) => fields.includes(m)).map(field)}</div>
                </fieldset>
                <fieldset className="sonar-group">
                  <legend>{c.groupFetus}</legend>
                  <div className="sonar-row is-three">{FETUS.map(field)}</div>
                </fieldset>

                {error && <p role="alert" className="sonar-error">{error}</p>}
                <button type="submit" disabled={busy} className="sonar-btn is-wide">{busy ? c.working : c.calc}</button>
                <p className="sonar-disclaimer">{c.disclaimer}</p>
              </form>

              <aside className="sonar-side">
                {latest ? (
                  <section>
                    <h2 className="sonar-h2">{c.result}</h2>
                    <ResultPanel exam={latest} c={c} lang={lang} />
                  </section>
                ) : <EmptyPanel c={c} />}
              </aside>
            </div>

            <section className="sonar-history">
              <div className="sonar-history-head">
                <h2 className="sonar-h2">{c.history}{history.length > 0 && <small>{c.count(history.length)}</small>}</h2>
                {history.length > 0 && (
                  <div className="sonar-actions">
                    <button type="button" onClick={copyReport} className="sonar-small"><ClipboardCopy size={14} aria-hidden="true" /> {c.copy}</button>
                    <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="sonar-small"><MessageCircle size={14} aria-hidden="true" /> {c.share}</a>
                    <button type="button" onClick={clearAll} className="sonar-small is-danger"><Trash2 size={14} aria-hidden="true" /> {c.clear}</button>
                  </div>
                )}
              </div>
              {notice && <p role="status" className="sonar-notice">{notice}</p>}
              {history.length
                ? <HistoryTable history={history} c={c} lang={lang} onDelete={remove} />
                : <div className="sonar-card sonar-empty-history">{c.noHistory}</div>}
              {more && <button type="button" onClick={loadMore} className="sonar-small" style={{ marginTop: 12 }}>{c.more}</button>}
            </section>
          </>
        )}
      </Container>
    </div>
  );
}
