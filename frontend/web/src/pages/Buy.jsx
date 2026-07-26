import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors, gradients } from '../theme/tokens.js';
import { webapi, auth } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { toast } from '../lib/toast.jsx';

export default function Buy() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const isBundle = sp.get('type') === 'bundle';
  const kind = isBundle ? 'bundle' : (sp.get('kind') === 'renewal' ? 'renewal' : 'enroll');
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [item, setItem] = useState(null);       // display item (course or bundle)
  const [target, setTarget] = useState(null);   // {kind, course_id|bundle_id}
  const [price, setPrice] = useState(null);      // server-quoted amount
  const [state, setState] = useState('idle');    // idle | working | error | done
  const [msg, setMsg] = useState('');

  useEffect(() => {
    const back = isBundle ? `/buy/${slug}?type=bundle` : `/buy/${slug}${kind === 'renewal' ? '?kind=renewal' : ''}`;
    if (!loading && !user) { navigate(`/auth?next=${encodeURIComponent(back)}`); return; }
    if (!user) return;
    const load = isBundle
      ? webapi.bundle(slug).then((r) => { setItem(r.bundle); return { kind: 'bundle', bundle_id: r.bundle.id }; })
      : webapi.course(slug).then((r) => { setItem(r.course); return { kind, course_id: r.course.id }; });
    load.then((tg) => {
      setTarget(tg);
      return auth.quote(tg).then((q) => setPrice(q.expected_amount)).catch((e) => {
        const er = e.data && e.data.error;
        if (er === 'needs_baytarian') { toast.error(t('lock.needs_baytarian')); navigate('/pricing'); }
        else if (er === 'already_enrolled') { setState('done'); setMsg('أنت مشترك بالفعل.'); }
      });
    }).catch(() => setMsg(isBundle ? 'الحزمة غير موجودة.' : 'الدورة غير موجودة.'));
  }, [slug, user, loading, navigate, isBundle, kind, t]);

  const isPaid = item ? (isBundle ? true : (item.is_paid ?? Number(item.price) > 0)) : false;

  async function enrollFree() {
    setState('working'); setMsg('');
    try { await auth.enroll(item.id); setState('done'); setMsg('تم تسجيلك في الدورة!'); toast.success('تم التسجيل'); }
    catch (e) {
      const er = e.data && e.data.error;
      if (e.status === 409) { setState('done'); setMsg('أنت مسجّل بالفعل.'); }
      else { setState('error'); setMsg(er === 'instructors_only' ? t('lock.instructors_only') : 'تعذّر التسجيل.'); }
    }
  }

  async function payNow() {
    setState('working'); setMsg('');
    try {
      const r = await auth.checkout(target);
      window.location.href = r.url;  // redirect to Fawaterak hosted page
    } catch (e) {
      const er = e.data && e.data.error;
      setState('error');
      setMsg(er === 'needs_baytarian' ? t('lock.needs_baytarian')
        : er === 'gateway_not_configured' ? 'الدفع غير مُفعّل حالياً — تواصل مع الدعم.'
        : er === 'already_enrolled' ? 'أنت مشترك بالفعل.'
        : er === 'gateway_error' ? 'تعذّر بدء الدفع، حاول مجدداً.'
        : 'تعذّر بدء الدفع.');
      if (er === 'needs_baytarian') navigate('/pricing');
    }
  }

  if (!item) return <Container style={{ padding: 60 }}><div style={{ color: colors.muted }}>{msg || t('common.loading')}</div></Container>;

  const card = { background: '#fff', border: `1px solid ${colors.line}`, borderRadius: 18, padding: 26, boxShadow: '0 8px 30px rgba(30,42,94,.05)' };
  const btn = { background: colors.accent, border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 800, padding: '14px 28px', cursor: 'pointer' };
  const shown = price != null ? price : Number(item.price || 0);

  return (
    <div style={{ background: colors.surfaceMuted, minHeight: '70vh' }}>
      <div style={{ background: gradients.darkPanel, color: '#fff', padding: '34px 0' }}>
        <Container>
          <div style={{ fontSize: 13, color: '#c9c9dc', marginBottom: 8 }}>
            {kind === 'bundle' ? 'حزمة تعليمية' : kind === 'renewal' ? 'تجديد الاشتراك' : 'إتمام الاشتراك'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>{item.title}</h1>
            <div style={{ background: 'rgba(255,255,255,.12)', borderRadius: 12, padding: '8px 18px', fontSize: 18, fontWeight: 900, color: '#F5D877' }}>
              {isPaid ? `${shown} ${item.currency || t('common.egp')}` : t('access.free')}
            </div>
          </div>
        </Container>
      </div>

      <Container style={{ padding: '28px 24px 60px', maxWidth: 640 }}>
        <div style={card}>
          {state === 'done' ? (
            <div style={{ textAlign: 'center', padding: 10 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>✅</div>
              <p style={{ fontSize: 16, fontWeight: 700 }}>{msg}</p>
              <button onClick={() => navigate('/dashboard')} style={btn}>الذهاب إلى لوحتي</button>
            </div>
          ) : !isPaid ? (
            <>
              <p style={{ fontSize: 15, color: colors.ink2, marginTop: 0 }}>هذه الدورة مجانية — سجّل مباشرةً وابدأ التعلّم.</p>
              <button onClick={enrollFree} disabled={state === 'working'} style={btn}>
                {state === 'working' ? '…' : (t('lang.name') === 'English' ? 'Enroll free' : 'التسجيل المجاني')}
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: 15, color: colors.ink2, marginTop: 0, lineHeight: 1.8 }}>
                {kind === 'renewal' ? 'جدّد اشتراكك وواصل الوصول للمحتوى.' : 'ادفع بأمان عبر فواتيرك — فيزا/ماستركارد، ميزة، محافظ الموبايل، أو فوري.'}
              </p>
              <button onClick={payNow} disabled={state === 'working'} style={{ ...btn, width: '100%' }}>
                {state === 'working' ? '⏳ جارٍ التحويل للدفع…' : `${t('renew.pay') && kind === 'renewal' ? t('renew.pay') : 'ادفع الآن'} · ${shown} ${item.currency || t('common.egp')}`}
              </button>
              <p style={{ fontSize: 12, color: colors.muted, margin: '14px 0 0', textAlign: 'center' }}>
                سيتم تحويلك لصفحة الدفع الآمنة، ويُفعّل اشتراكك تلقائياً بعد نجاح العملية.
              </p>
            </>
          )}
          {msg && state === 'error' && <p style={{ color: '#b3261e', marginTop: 14, fontWeight: 700 }}>{msg}</p>}
        </div>
      </Container>
    </div>
  );
}
