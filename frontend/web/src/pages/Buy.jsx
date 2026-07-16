import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { webapi, auth } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { toast } from '../lib/toast.jsx';

const NF = 'Not Found';
const val = (v) => (v == null || v === NF || v === '' ? null : v);

function Step({ n, title, active, done }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity: active || done ? 1 : 0.45 }}>
      <span style={{
        width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 800, fontSize: 15, color: '#fff',
        background: done ? '#1a7f4b' : active ? colors.accent : colors.muted2,
      }}>{done ? '✓' : n}</span>
      <span style={{ fontWeight: 800, fontSize: 14 }}>{title}</span>
    </div>
  );
}

function Check({ ok, warn, label, value }) {
  const color = ok ? '#1a7f4b' : warn ? '#b3261e' : colors.muted;
  const bg = ok ? '#e8f5ee' : warn ? '#fdecea' : colors.surfaceAlt;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: bg, borderRadius: 10 }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color, direction: 'ltr' }}>
        {ok ? '✓ ' : warn ? '✗ ' : ''}{value}
      </span>
    </div>
  );
}

export default function Buy() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [course, setCourse] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState('idle'); // idle | analyzing | analyzed | working | done | error
  const [analysis, setAnalysis] = useState(null); // preview OCR analysis (nothing saved yet)
  const [result, setResult] = useState(null); // final submitted payment
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!loading && !user) { navigate(`/auth?next=/buy/${slug}`); return; }
    webapi.course(slug).then((r) => setCourse(r.course)).catch(() => setMsg('الدورة غير موجودة.'));
    webapi.instapayAccounts().then((r) => setAccounts(r.accounts)).catch(() => {});
  }, [slug, user, loading, navigate]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const price = course ? Number(course.price) : 0;
  const payAccount = accounts.find((a) => a.url) || accounts[0];
  const payUrl = payAccount?.url;

  function pick(f) {
    if (!f) return;
    setFile(f);
    setAnalysis(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    runAnalyze(f); // auto-analyze on upload
  }

  async function runAnalyze(f) {
    setState('analyzing'); setMsg(''); setAnalysis(null);
    try {
      const r = await auth.analyzeReceipt(course.id, f);
      setAnalysis(r);
      setState('analyzed');
    } catch (err) {
      const er = err.data && err.data.error;
      setState('error');
      const m = er === 'already_enrolled' ? 'أنت مسجّل بالفعل في هذه الدورة.'
        : er === 'unsupported_media_type' ? 'صيغة الصورة غير مدعومة (JPG/PNG/WEBP).'
        : 'تعذّر تحليل الإيصال. حاول مجدداً.';
      setMsg(m); toast.error(m);
    }
  }

  function copy(text) {
    navigator.clipboard?.writeText(text).then(() => toast.success('تم النسخ'));
  }

  async function enrollFree() {
    setState('working'); setMsg('');
    try { await auth.enroll(course.id); setState('done'); setMsg('تم تسجيلك في الدورة!'); toast.success('تم التسجيل'); }
    catch (e) {
      if (e.status === 409) { setState('done'); setMsg('أنت مسجّل بالفعل في هذه الدورة.'); }
      else { setState('error'); setMsg('تعذّر التسجيل.'); toast.error('تعذّر التسجيل'); }
    }
  }

  async function submitReceipt() {
    if (!file) { toast.error('أرفق صورة إيصال إنستاباي أولاً'); return; }
    setState('working'); setMsg('');
    try {
      const r = await auth.submitReceipt(course.id, file);
      setResult(r.payment);
      setState('done');
      toast.success('تم استلام الإيصال وتحليله');
    } catch (err) {
      const er = err.data && err.data.error;
      setState('error');
      const m = er === 'already_enrolled' ? 'أنت مسجّل بالفعل في هذه الدورة.'
        : er === 'reference_already_used' ? 'الرقم المرجعي مستخدم من قبل — تأكد من الإيصال.'
        : er === 'unsupported_media_type' ? 'صيغة الصورة غير مدعومة (JPG/PNG/WEBP).'
        : 'تعذّر رفع الإيصال. حاول مجدداً.';
      setMsg(m); toast.error(m);
    }
  }

  if (!course) return <Container style={{ padding: 60 }}><div style={{ color: colors.muted }}>{msg || 'جارٍ التحميل…'}</div></Container>;

  // analysis checks — ALL must be green to allow proceeding
  const p = analysis?.parsed || {};
  const checks = analysis ? [
    { label: 'الرقم المرجعي', ok: !!val(p.reference), value: val(p.reference) || 'غير موجود' },
    { label: 'غير مستخدم سابقاً (معلّق/معتمد)', ok: !analysis.reference_used, value: analysis.reference_used ? 'مستخدم من قبل!' : 'جديد ✓' },
    { label: 'المبلغ المحوّل', ok: typeof p.total_amount === 'number', value: typeof p.total_amount === 'number' ? `${p.total_amount} EGP` : 'غير موجود' },
    { label: `يغطي سعر الدورة (${analysis.expected_amount} ${course.currency})`, ok: !!analysis.amount_matches_price, value: analysis.amount_matches_price ? 'كافٍ' : 'أقل من السعر' },
    { label: 'تطابق المبالغ (الإجمالي − الرسوم)', ok: p.is_total_amount_correct === true, value: p.is_total_amount_correct ? 'متطابقة' : 'غير متطابقة' },
    { label: 'حساب المستقبِل حساب المنصة', ok: p.ogs_account_found === 'Exist', value: p.ogs_account_found === 'Exist' ? 'موثّق' : 'غير موثّق' },
    { label: 'صحة الإيصال', ok: p.transaction_approved === 'Transaction Approved', value: p.transaction_approved === 'Transaction Approved' ? 'معاملة ناجحة' : 'غير مؤكدة' },
  ] : [];
  const allGreen = checks.length > 0 && checks.every((c) => c.ok);

  const card = { background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 18, padding: 24, boxShadow: '0 8px 30px rgba(30,42,94,.05)' };
  const btn = { background: colors.accent, border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 800, padding: '13px 26px', cursor: 'pointer' };

  return (
    <div style={{ background: colors.surfaceMuted, minHeight: '70vh' }}>
      {/* header strip */}
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '34px 0' }}>
        <Container>
          <div style={{ fontSize: 13, color: '#c9c9dc', marginBottom: 8 }}>
            <span onClick={() => navigate(`/courses/${slug}`)} style={{ cursor: 'pointer' }}>الدورة</span> › إتمام الاشتراك
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>{course.title}</h1>
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 12, padding: '8px 18px', fontSize: 18, fontWeight: 900, color: '#F5D877' }}>
              {price > 0 ? `${price} ${course.currency}` : 'مجاناً'}
            </div>
          </div>
        </Container>
      </div>

      <Container style={{ padding: '28px 24px 60px', maxWidth: 760 }}>
        {price === 0 ? (
          <div style={card}>
            {state === 'done' ? (
              <div style={{ textAlign: 'center', padding: 10 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
                <p style={{ fontSize: 16, fontWeight: 700 }}>{msg}</p>
                <button onClick={() => navigate('/dashboard')} style={btn}>الذهاب إلى لوحتي</button>
              </div>
            ) : (
              <>
                <p style={{ fontSize: 15, color: colors.ink2, marginTop: 0 }}>هذه الدورة مجانية — سجّل مباشرةً وابدأ التعلّم.</p>
                <button onClick={enrollFree} disabled={state === 'working'} style={btn}>{state === 'working' ? '…' : 'التسجيل المجاني'}</button>
                {msg && <p style={{ color: '#b3261e', marginTop: 12 }}>{msg}</p>}
              </>
            )}
          </div>
        ) : state === 'done' && result ? (
          /* ---------- step 3: OCR result review ---------- */
          <div style={card}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 40 }}>🧾</div>
              <h2 style={{ margin: '6px 0 4px', fontSize: 20 }}>تم استلام إيصالك — هذه البيانات المستخرجة آلياً</h2>
              <p style={{ color: colors.muted, fontSize: 14, margin: 0 }}>سيراجعها فريقنا ويُفعّل اشتراكك بعد الاعتماد. تابع الحالة من لوحتك.</p>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <Check ok={!!val(result.reference)} warn={!val(result.reference)} label="الرقم المرجعي"
                value={val(result.reference) || 'غير موجود'} />
              <Check ok={val(result.transfer_amount) != null} warn={val(result.transfer_amount) == null} label="المبلغ المحوّل"
                value={val(result.transfer_amount) != null ? `${result.transfer_amount} ${result.currency}` : 'غير موجود'} />
              {val(result.total_amount) != null && (
                <Check ok label="الإجمالي (مع الرسوم)" value={`${result.total_amount} ${result.currency}${val(result.fees) ? ` · رسوم ${result.fees}` : ''}`} />
              )}
              <Check ok={result.is_total_amount_correct === true} warn={result.is_total_amount_correct === false}
                label="تطابق المبالغ" value={result.is_total_amount_correct ? 'متطابقة' : 'تحتاج مراجعة'} />
              <Check ok={result.ogs_account_found === 'Exist'} warn={result.ogs_account_found !== 'Exist'}
                label="حساب المستقبِل" value={result.ogs_account_found === 'Exist' ? 'حساب المنصة' : 'غير موثّق'} />
              <Check ok={result.transaction_approved === 'Transaction Approved'} warn={result.transaction_approved !== 'Transaction Approved'}
                label="صحة الإيصال" value={result.transaction_approved === 'Transaction Approved' ? 'معاملة ناجحة' : 'غير مؤكدة'} />
              {val(result.tx_date_text) && <Check ok label="تاريخ العملية" value={result.tx_date_text} />}
            </div>
            <div style={{ marginTop: 16, padding: '12px 14px', background: '#fdf6e3', border: '1px solid #f2e69b', borderRadius: 10, fontSize: 13, color: '#5e5524' }}>
              حالة الطلب: <b>بانتظار مراجعة الإدارة</b> — ستصلك رسالة عند القبول.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => navigate('/dashboard')} style={btn}>الذهاب إلى لوحتي</button>
              <button onClick={() => { setState('idle'); setResult(null); setFile(null); setPreview(null); }}
                style={{ ...btn, background: 'transparent', color: colors.accent, border: `1.5px solid ${colors.accent}` }}>
                رفع إيصال آخر
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* stepper */}
            <div style={{ display: 'flex', gap: 24, margin: '4px 0 20px', flexWrap: 'wrap' }}>
              <Step n={1} title="حوّل المبلغ عبر إنستاباي" active={!file} done={!!file} />
              <Step n={2} title="ارفع صورة الإيصال" active={!!file} done={false} />
              <Step n={3} title="مراجعة وتفعيل" active={false} done={false} />
            </div>

            {/* step 1: pay */}
            <div style={{ ...card, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 6px', fontSize: 17 }}>١ · حوّل <span style={{ color: colors.accent }}>{price} {course.currency}</span> إلى حساب المنصة</h3>
              {accounts.length === 0 ? (
                <div style={{ color: colors.muted, fontSize: 14 }}>لم تُضبط حسابات الدفع بعد — تواصل مع الدعم.</div>
              ) : (
                <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    {accounts.map((a, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 0', borderBottom: i < accounts.length - 1 ? `1px solid ${colors.line2}` : 'none' }}>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 14 }}>{a.account_name}</div>
                          {a.number && <div style={{ direction: 'ltr', textAlign: 'right', fontSize: 14, color: colors.ink2 }}>{a.number}</div>}
                          {a.url && <div style={{ direction: 'ltr', textAlign: 'right', fontSize: 12, color: colors.muted }}>{a.url}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {a.number && <button type="button" onClick={() => copy(a.number)} style={{ border: `1px solid ${colors.line}`, background: '#fff', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>نسخ الرقم</button>}
                          {a.url && (
                            <a href={a.url.startsWith('http') ? a.url : `https://${a.url}`} target="_blank" rel="noreferrer"
                              style={{ background: colors.accent, color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>
                              فتح إنستاباي ↗
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {payUrl && (
                    <div style={{ textAlign: 'center' }}>
                      <img
                        alt="QR للدفع عبر إنستاباي"
                        width={132} height={132}
                        style={{ borderRadius: 12, border: `1px solid ${colors.line}`, padding: 6, background: '#fff' }}
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=132x132&data=${encodeURIComponent(payUrl.startsWith('http') ? payUrl : 'https://' + payUrl)}`}
                      />
                      <div style={{ fontSize: 12, color: colors.muted, marginTop: 6 }}>امسح للدفع</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* step 2: upload + analyze */}
            <form onSubmit={(e) => { e.preventDefault(); if (file) runAnalyze(file); }} style={card}>
              <h3 style={{ margin: '0 0 10px', fontSize: 17 }}>٢ · ارفع صورة الإيصال</h3>
              <label htmlFor="receipt" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                border: `2px dashed ${file ? colors.accent : colors.line}`, borderRadius: 14, padding: 22,
                cursor: 'pointer', background: file ? colors.accentSoft : colors.surfaceAlt, textAlign: 'center',
              }}>
                {preview ? (
                  <img src={preview} alt="معاينة الإيصال" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 10 }} />
                ) : (
                  <>
                    <span style={{ fontSize: 34 }}>📷</span>
                    <span style={{ fontWeight: 800, fontSize: 15 }}>اضغط لاختيار صورة الإيصال</span>
                    <span style={{ fontSize: 12, color: colors.muted }}>JPG / PNG / WEBP — حتى 8MB</span>
                  </>
                )}
                <input id="receipt" type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => pick(e.target.files[0])} />
              </label>
              {file && <div style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>{file.name}</div>}

              {state !== 'analyzed' && state !== 'working' && (
                <button type="submit" disabled={state === 'analyzing' || !file}
                  style={{ ...btn, width: '100%', marginTop: 14, opacity: state === 'analyzing' || !file ? 0.6 : 1 }}>
                  {state === 'analyzing' ? '⏳ جارٍ الرفع والتحليل الآلي…' : 'إعادة التحليل'}
                </button>
              )}

              {state === 'analyzing' && (
                <div style={{ textAlign: 'center', padding: '18px 0 4px', color: colors.muted, fontSize: 14 }}>
                  <span style={{ display: 'inline-block', width: 22, height: 22, border: `3px solid ${colors.line}`,
                    borderTopColor: colors.accent, borderRadius: '50%', animation: 'spin .8s linear infinite',
                    verticalAlign: 'middle', marginInlineEnd: 8 }} />
                  يُحلَّل الإيصال آلياً (OCR)…
                  <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
                </div>
              )}

              {(state === 'analyzed' || state === 'working') && analysis && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 10px', fontSize: 15 }}>نتيجة التحليل الآلي</h4>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {checks.map((c, i) => (
                      <Check key={i} ok={c.ok} warn={!c.ok} label={c.label} value={c.value} />
                    ))}
                  </div>
                  {allGreen ? (
                    <button type="button" onClick={submitReceipt} disabled={state === 'working'}
                      style={{ ...btn, width: '100%', marginTop: 14, background: '#1a7f4b' }}>
                      {state === 'working' ? '…' : '✓ كل الفحوصات ناجحة — إرسال طلب الدفع'}
                    </button>
                  ) : (
                    <div style={{ marginTop: 14, padding: '12px 14px', background: '#fdecea', border: '1px solid #f5c6c2', borderRadius: 10, fontSize: 13, color: '#b3261e', fontWeight: 700 }}>
                      {analysis.reference_used
                        ? 'هذا الإيصال مستخدم من قبل (طلب معلّق أو معتمد) — لا يمكن إعادة استخدامه.'
                        : 'بعض الفحوصات لم تنجح — تأكد من وضوح الصورة وصحة التحويل ثم أعد التحليل.'}
                      <div style={{ marginTop: 10 }}>
                        <button type="button" onClick={() => { setFile(null); setPreview(null); setAnalysis(null); setState('idle'); }}
                          style={{ ...btn, background: 'transparent', color: colors.accent, border: `1.5px solid ${colors.accent}`, padding: '8px 18px', fontSize: 14 }}>
                          اختيار صورة أخرى
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {msg && <p style={{ color: '#b3261e', marginTop: 12, fontWeight: 700, fontSize: 14 }}>{msg}</p>}
              <p style={{ fontSize: 12, color: colors.muted, margin: '12px 0 0', textAlign: 'center' }}>
                يُحلَّل الإيصال آلياً (OCR) للتحقق من الرقم المرجعي والمبلغ وحساب المستقبِل، ثم يعتمده فريق الإدارة.
              </p>
            </form>
          </>
        )}
      </Container>
    </div>
  );
}
