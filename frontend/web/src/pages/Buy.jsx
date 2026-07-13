import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors } from '../theme/tokens.js';
import { webapi, auth } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';

export default function Buy() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [course, setCourse] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [file, setFile] = useState(null);
  const [state, setState] = useState('idle'); // idle | working | done | error
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // must be logged in — send to auth, remember where to return
    if (!loading && !user) { navigate(`/auth?next=/buy/${slug}`); return; }
    webapi.course(slug).then((r) => setCourse(r.course)).catch(() => setMsg('الدورة غير موجودة.'));
    webapi.instapayAccounts().then((r) => setAccounts(r.accounts)).catch(() => {});
  }, [slug, user, loading, navigate]);

  const price = course ? Number(course.price) : 0;

  async function enrollFree() {
    setState('working'); setMsg('');
    try { await auth.enroll(course.id); setState('done'); setMsg('تم تسجيلك في الدورة! انتقل إلى لوحتك.'); }
    catch (e) {
      if (e.status === 409) { setState('done'); setMsg('أنت مسجّل بالفعل في هذه الدورة.'); }
      else setState('error'), setMsg('تعذّر التسجيل.');
    }
  }

  async function submitReceipt(e) {
    e.preventDefault();
    if (!file) { setMsg('أرفق صورة إيصال إنستاباي.'); return; }
    setState('working'); setMsg('');
    try {
      await auth.submitReceipt(course.id, file);
      setState('done');
      setMsg('تم استلام إيصالك ✅ سيُراجعه فريقنا ويُفعّل اشتراكك قريباً. تابع الحالة من لوحتك.');
    } catch (err) {
      const er = err.data && err.data.error;
      setState('error');
      setMsg(
        er === 'already_enrolled' ? 'أنت مسجّل بالفعل في هذه الدورة.'
        : er === 'reference_already_used' ? 'رقم مرجعي مستخدم من قبل — تأكد من الإيصال.'
        : er === 'unsupported_media_type' ? 'صيغة الصورة غير مدعومة (JPG/PNG).'
        : 'تعذّر رفع الإيصال. حاول مجدداً.'
      );
    }
  }

  if (!course) return <Container style={{ padding: 60 }}><div style={{ color: colors.muted }}>{msg || 'جارٍ التحميل…'}</div></Container>;

  return (
    <Container style={{ padding: '40px 24px 60px', maxWidth: 720 }}>
      <div style={{ fontSize: 13, color: colors.muted, marginBottom: 10 }}>
        <span onClick={() => navigate(`/courses/${slug}`)} style={{ cursor: 'pointer' }}>الدورة</span> › الاشتراك
      </div>
      <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 6px' }}>{course.title}</h1>
      <div style={{ fontSize: 18, fontWeight: 800, color: colors.accent, marginBottom: 24 }}>
        {price > 0 ? `${price} ${course.currency}` : 'مجاناً'}
      </div>

      {state === 'done' ? (
        <div style={{ border: `1px solid ${colors.line}`, borderRadius: 16, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
          <p style={{ fontSize: 16, fontWeight: 700 }}>{msg}</p>
          <button onClick={() => navigate('/dashboard')} style={btn(colors)}>الذهاب إلى لوحتي</button>
        </div>
      ) : price === 0 ? (
        <div style={{ border: `1px solid ${colors.line}`, borderRadius: 16, padding: 24 }}>
          <p style={{ fontSize: 15, color: colors.ink2 }}>هذه الدورة مجانية — سجّل مباشرةً وابدأ التعلّم.</p>
          <button onClick={enrollFree} disabled={state === 'working'} style={btn(colors)}>
            {state === 'working' ? '…' : 'التسجيل المجاني'}
          </button>
          {msg && <p style={{ color: colors.accent, marginTop: 12 }}>{msg}</p>}
        </div>
      ) : (
        <form onSubmit={submitReceipt} style={{ border: `1px solid ${colors.line}`, borderRadius: 16, padding: 24 }}>
          <h3 style={{ margin: '0 0 12px' }}>ادفع عبر إنستاباي</h3>
          <p style={{ fontSize: 14, color: colors.muted, margin: '0 0 12px' }}>
            حوّل مبلغ <b style={{ color: colors.ink }}>{price} {course.currency}</b> إلى أحد حسابات المركز التالية، ثم ارفع صورة الإيصال:
          </p>
          <div style={{ background: colors.surfaceAlt, borderRadius: 12, padding: 14, marginBottom: 18 }}>
            {accounts.length === 0 ? (
              <div style={{ color: colors.muted, fontSize: 14 }}>لم تُضبط حسابات الدفع بعد — تواصل مع الدعم.</div>
            ) : accounts.map((a, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                <span style={{ fontWeight: 700 }}>{a.account_name}</span>
                <span style={{ direction: 'ltr', fontWeight: 800 }}>{a.number || a.url}</span>
              </div>
            ))}
          </div>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>صورة الإيصال</label>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files[0])}
            style={{ marginBottom: 16, display: 'block' }} />
          <button type="submit" disabled={state === 'working'} style={btn(colors)}>
            {state === 'working' ? 'جارٍ الرفع…' : 'إرسال الإيصال للمراجعة'}
          </button>
          {msg && <p style={{ color: colors.accent, marginTop: 12 }}>{msg}</p>}
        </form>
      )}
    </Container>
  );
}

const btn = (colors) => ({
  marginTop: 16, background: colors.accent, border: 'none', borderRadius: 12, color: '#fff',
  fontSize: 16, fontWeight: 800, padding: '13px 26px', cursor: 'pointer',
});
