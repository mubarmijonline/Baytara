import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import { colors } from '../theme/tokens.js';
import { auth } from '../lib/api.js';

// After Fawaterak redirects back. The webhook confirms payment server-side; here we
// poll our own payment status a few times to reflect the outcome.
export default function PaymentCallback() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const status = sp.get('status');       // success | fail | pending
  const pid = sp.get('pid');
  const [state, setState] = useState(status === 'fail' ? 'failed' : 'checking');

  useEffect(() => {
    if (!pid || status === 'fail') return;
    let tries = 0;
    let alive = true;
    const tick = () => {
      auth.paymentStatus(pid).then((r) => {
        if (!alive) return;
        const s = r.payment.status;
        if (s === 'paid') setState('paid');
        else if (s === 'failed' || s === 'expired') setState('failed');
        else if (++tries < 6) setTimeout(tick, 2000);   // webhook may lag a few seconds
        else setState('pending');
      }).catch(() => { if (alive && ++tries < 6) setTimeout(tick, 2000); else setState('pending'); });
    };
    tick();
    return () => { alive = false; };
  }, [pid, status]);

  const view = {
    checking: { icon: '⏳', title: 'جارٍ تأكيد الدفع…', sub: 'لحظات من فضلك.' },
    paid: { icon: '✅', title: 'تم الدفع بنجاح', sub: 'تم تفعيل اشتراكك. ابدأ التعلّم الآن.' },
    pending: { icon: '🕓', title: 'الدفع قيد المعالجة', sub: 'سيصلك إشعار عند التأكيد. تابع من لوحتك.' },
    failed: { icon: '❌', title: 'لم تكتمل عملية الدفع', sub: 'لم يتم خصم أي مبلغ. يمكنك المحاولة مجدداً.' },
  }[state];

  return (
    <Container style={{ padding: '80px 24px', maxWidth: 520, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 12 }}>{view.icon}</div>
      <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 10px' }}>{view.title}</h1>
      <p style={{ color: colors.muted, fontSize: 16, margin: '0 0 26px' }}>{view.sub}</p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/dashboard')}
          style={{ background: colors.accent, color: '#fff', border: 'none', borderRadius: 12, fontWeight: 800, fontSize: 15, padding: '12px 24px', cursor: 'pointer' }}>
          لوحتي
        </button>
        <button onClick={() => navigate('/courses')}
          style={{ background: '#fff', color: colors.ink, border: `1.5px solid ${colors.line}`, borderRadius: 12, fontWeight: 700, fontSize: 15, padding: '12px 24px', cursor: 'pointer' }}>
          تصفّح الدورات
        </button>
      </div>
    </Container>
  );
}
