import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import PaymentBadges from '../components/PaymentBadges.jsx';
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
  // `?go=1` turns this page into a direct payment link: the student taps a link in
  // WhatsApp and lands on the gateway, without a second tap here. The course and the price
  // are still painted first, so a slow gateway leaves them looking at what they are about
  // to pay for rather than at a blank page.
  //
  // It is a link for OUTSIDE the app on purpose. The iOS app offers no purchase and no
  // link to one (mobile_app/lib/features/payments/data/purchase_availability.dart);
  // WhatsApp, email and the website are where Apple has no say, and where this audience
  // already is.
  const auto = sp.get('go') === '1';
  const kind = isBundle ? 'bundle' : (sp.get('kind') === 'renewal' ? 'renewal' : 'enroll');
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const [item, setItem] = useState(null);       // display item (course or bundle)
  const [target, setTarget] = useState(null);   // {kind, course_id|bundle_id}
  const [price, setPrice] = useState(null);      // server-quoted amount
  // The code is a string the server judges. Nothing here computes a discount: the figures
  // below are whatever /payment/quote answered, and checkout recomputes them again.
  const [code, setCode] = useState('');
  const [promo, setPromo] = useState(null);     // { code, kind, value } once accepted
  const [discount, setDiscount] = useState(0);
  const [promoError, setPromoError] = useState('');
  const [checking, setChecking] = useState(false);
  const [state, setState] = useState('idle');    // idle | working | error | done
  // Fires the automatic checkout exactly once. A state check is not enough on its own:
  // React runs effects twice on mount in development, and both runs would see `idle` and
  // open two payments against one link.
  const started = useRef(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    // The sign-in round trip has to carry `go` too, or a link sent to someone who is not
    // signed in loses the one thing that made it direct.
    const params = new URLSearchParams();
    if (isBundle) params.set('type', 'bundle');
    if (kind === 'renewal') params.set('kind', 'renewal');
    if (auto) params.set('go', '1');
    const query = params.toString();
    const back = `/buy/${slug}${query ? `?${query}` : ''}`;
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
  }, [slug, user, loading, navigate, isBundle, kind, auto, t]);

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

  async function applyCode() {
    const entered = code.trim();
    if (!entered || !target) return;
    setChecking(true); setPromoError('');
    try {
      const r = await auth.quote({ ...target, code: entered });
      if (r.promo_error) {
        setPromo(null); setDiscount(0);
        setPromoError(t(`promo.err.${r.promo_error}`));
      } else {
        setPromo(r.promo); setDiscount(Number(r.discount) || 0);
        setPrice(r.final_amount);
        toast.success(t('promo.applied'));
      }
    } catch {
      setPromoError(t('promo.err.generic'));
    } finally { setChecking(false); }
  }

  function clearCode() {
    setCode(''); setPromo(null); setDiscount(0); setPromoError('');
    if (target) auth.quote(target).then((r) => setPrice(r.expected_amount)).catch(() => {});
  }

  async function payNow() {
    setState('working'); setMsg('');
    try {
      const r = await auth.checkout({ ...target, code: promo ? code.trim() : undefined });
      window.location.href = r.url;  // redirect to Fawaterak hosted page
    } catch (e) {
      const er = e.data && e.data.error;
      setState('error');
      setMsg(er === 'needs_baytarian' ? t('lock.needs_baytarian')
        : er === 'gateway_not_configured' ? 'الدفع غير مُفعّل حالياً — تواصل مع الدعم.'
        : er === 'already_enrolled' ? 'أنت مشترك بالفعل.'
        : (er || '').startsWith('promo_') ? t(`promo.err.${er}`)
        : er === 'gateway_error' ? 'تعذّر بدء الدفع، حاول مجدداً.'
        : 'تعذّر بدء الدفع.');
      if (er === 'needs_baytarian') navigate('/pricing');
    }
  }

  // The direct link's one job. Deliberately after the quote rather than on page load: the
  // amount comes from the server, and sending someone to pay before we know what they owe
  // is how a price on a shared link and a price at the gateway end up different.
  useEffect(() => {
    if (!auto || started.current) return;
    if (state !== 'idle' || !item || !isPaid || price == null) return;
    started.current = true;
    payNow();
  });

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
              {/* The code box sits above the pay button, because a buyer who has one wants
                  to see the new total before committing, not after. */}
              <div style={{ margin: '4px 0 16px' }}>
                {promo ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                    background: '#eef7f1', border: '1px solid #bfe3ce', borderRadius: 10, padding: '10px 14px' }}>
                    <span style={{ fontWeight: 800, color: '#1a7f4b', fontSize: 14 }}>
                      {promo.code} · −{discount} {item.currency || t('common.egp')}
                    </span>
                    <button type="button" onClick={clearCode}
                      style={{ background: 'transparent', border: 0, color: colors.muted,
                        cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
                      {t('promo.remove')}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <input
                      value={code}
                      onChange={(e) => { setCode(e.target.value); setPromoError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && applyCode()}
                      placeholder={t('promo.placeholder')}
                      dir="ltr"
                      style={{ flex: '1 1 180px', minWidth: 0, border: `1px solid ${colors.line}`,
                        borderRadius: 10, padding: '12px 14px', fontSize: 15, textTransform: 'uppercase' }}
                    />
                    <button type="button" onClick={applyCode} disabled={checking || !code.trim()}
                      style={{ border: `1px solid ${colors.line}`, background: 'transparent',
                        borderRadius: 10, padding: '12px 20px', fontWeight: 700, fontSize: 14,
                        cursor: checking || !code.trim() ? 'default' : 'pointer', color: colors.ink }}>
                      {checking ? '…' : t('promo.apply')}
                    </button>
                  </div>
                )}
                {promoError && (
                  <p style={{ color: '#b3261e', fontSize: 13, margin: '8px 0 0', fontWeight: 600 }}>{promoError}</p>
                )}
              </div>

              <button onClick={payNow} disabled={state === 'working'} style={{ ...btn, width: '100%' }}>
                {state === 'working' ? '⏳ جارٍ التحويل للدفع…' : `${t('renew.pay') && kind === 'renewal' ? t('renew.pay') : 'ادفع الآن'} · ${shown} ${item.currency || t('common.egp')}`}
              </button>
              <p style={{ fontSize: 12, color: colors.muted, margin: '14px 0 0', textAlign: 'center' }}>
                سيتم تحويلك لصفحة الدفع الآمنة، ويُفعّل اشتراكك تلقائياً بعد نجاح العملية.
              </p>
              {/* Before the button, not after the payment: what a buyer needs to know is
                  which cards work, while they are still deciding. */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${colors.line}` }}>
                <PaymentBadges tone="light" align="center" />
              </div>
            </>
          )}
          {msg && state === 'error' && <p style={{ color: '#b3261e', marginTop: 14, fontWeight: 700 }}>{msg}</p>}
        </div>
      </Container>
    </div>
  );
}
