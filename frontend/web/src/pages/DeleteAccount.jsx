// Closing your own account.
//
// The App Store requires deletion inside the app, and Google Play also wants a web
// address where it can be requested by someone who no longer has the app. This page is
// that address (baytara.app/account/delete), and the profile's settings tab links here.
// What is removed and what is kept is decided by the server
// (backend/app/services/account_deletion.py); this page only has to say it truthfully.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import { colors } from '../theme/tokens.js';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { SUPPORT_EMAIL } from '../lib/support.js';

const COPY = {
  ar: {
    breadcrumb: 'الرئيسية › حذف الحساب',
    title: 'حذف الحساب',
    subtitle: 'يمكنك حذف حسابك على بَيْطَرَة في أي وقت.',
    removedTitle: 'ما الذي يُحذف',
    removed: [
      'اسمك وبريدك الإلكتروني ورقم هاتفك وصورك.',
      'رقمك القومي وصور الكارنيه والمستندات التي رفعتها للتوثيق.',
      'تقييماتك للدورات، وشهاداتك (فلن تعود صفحة التحقق من الشهادة تعمل).',
      'أجهزتك المسجلة وإشعاراتك.',
    ],
    keptTitle: 'ما الذي نحتفظ به',
    kept: [
      'سجلات الدفع والاشتراكات، بدون اسمك أو بيانات تواصلك، لأنها سجلات مالية نلتزم بحفظها.',
    ],
    final: 'الحذف نهائي ولا يمكن التراجع عنه، وستفقد الوصول لكل الدورات التي اشتريتها. يمكنك إنشاء حساب جديد بنفس البريد لاحقاً، لكنه سيبدأ فارغاً.',
    signInLead: 'سجّل الدخول أولاً بالحساب الذي تريد حذفه.',
    signIn: 'تسجيل الدخول',
    noAccess: 'لا تستطيع الدخول لحسابك؟ راسلنا من البريد المسجل به على',
    staff: 'حسابات المحاضرين والإدارة تُغلق من خلال إدارة المنصة. تواصل معنا على',
    password: 'كلمة المرور',
    confirm: 'أفهم أن حذف الحساب نهائي وأنني سأفقد الوصول لكل دوراتي.',
    submit: 'حذف حسابي نهائياً',
    working: 'جارٍ الحذف…',
    wrongPassword: 'كلمة المرور غير صحيحة.',
    failed: 'تعذّر حذف الحساب. حاول مرة أخرى أو راسلنا.',
    doneTitle: 'تم حذف حسابك',
    done: 'تم حذف بياناتك وتسجيل خروجك. شكراً لأنك كنت معنا.',
    home: 'العودة للرئيسية',
    back: 'رجوع للإعدادات',
  },
  en: {
    breadcrumb: 'Home › Delete account',
    title: 'Delete account',
    subtitle: 'You can delete your Baytara account at any time.',
    removedTitle: 'What is deleted',
    removed: [
      'Your name, email address, phone number and photos.',
      'Your national ID and the card images and documents you uploaded for verification.',
      'Your course reviews and your certificates (their verification page will stop working).',
      'Your registered devices and your notifications.',
    ],
    keptTitle: 'What we keep',
    kept: [
      'Payment and enrolment records, without your name or contact details, because they are financial records we are required to keep.',
    ],
    final: 'Deletion is permanent and cannot be undone, and you will lose access to every course you bought. You can register again later with the same email, but the new account starts empty.',
    signInLead: 'First sign in to the account you want to delete.',
    signIn: 'Sign in',
    noAccess: 'Cannot sign in? Email us from the address on the account at',
    staff: 'Instructor and admin accounts are closed by the platform team. Contact us at',
    password: 'Password',
    confirm: 'I understand that deleting my account is permanent and that I will lose access to all my courses.',
    submit: 'Delete my account permanently',
    working: 'Deleting…',
    wrongPassword: 'That password is not correct.',
    failed: 'The account could not be deleted. Try again, or email us.',
    doneTitle: 'Your account has been deleted',
    done: 'Your data has been deleted and you have been signed out. Thank you for learning with us.',
    home: 'Back to the home page',
    back: 'Back to settings',
  },
};

const box = { background: colors.surface, border: `1px solid ${colors.line}`, borderRadius: 14, padding: '22px 22px' };
const danger = '#b3261e';

function List({ title, items }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: colors.ink, margin: '0 0 10px' }}>{title}</h2>
      <ul style={{ margin: 0, paddingInlineStart: 20, color: colors.muted, fontSize: 15, lineHeight: 1.9 }}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

function Support({ lead }) {
  return (
    <p style={{ fontSize: 14, color: colors.muted, lineHeight: 1.9, margin: '14px 0 0' }}>
      {lead} <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr" style={{ color: colors.accent, fontWeight: 700 }}>{SUPPORT_EMAIL}</a>
    </p>
  );
}

export default function DeleteAccount() {
  const { lang } = useI18n();
  const text = COPY[lang === 'en' ? 'en' : 'ar'];
  const { user, loading, closeAccount } = useAuth();
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!agreed || busy) return;
    setBusy(true);
    setError('');
    try {
      await closeAccount(password);
      setDone(true);
    } catch (err) {
      setError(err?.message === 'wrong_password' ? text.wrongPassword : text.failed);
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (done) {
    body = (
      <div style={box} role="status">
        <h2 style={{ fontSize: 20, fontWeight: 800, color: colors.ink, margin: '0 0 8px' }}>{text.doneTitle}</h2>
        <p style={{ fontSize: 15, color: colors.muted, lineHeight: 1.9, margin: '0 0 16px' }}>{text.done}</p>
        <Link to="/" style={{ color: colors.accent, fontWeight: 700 }}>{text.home}</Link>
      </div>
    );
  } else if (loading) {
    body = null;
  } else if (!user) {
    body = (
      <div style={box}>
        <p style={{ fontSize: 15, color: colors.ink2, margin: '0 0 14px' }}>{text.signInLead}</p>
        <Link to="/auth?next=/account/delete"
          style={{ display: 'inline-block', background: colors.accent, color: '#fff', fontWeight: 700, padding: '11px 22px', borderRadius: 10, textDecoration: 'none' }}>
          {text.signIn}
        </Link>
        <Support lead={text.noAccess} />
      </div>
    );
  } else if (user.role !== 'student') {
    body = <div style={box}><Support lead={text.staff} /></div>;
  } else {
    body = (
      <form onSubmit={submit} style={box}>
        <p style={{ fontSize: 15, color: danger, fontWeight: 700, lineHeight: 1.9, margin: '0 0 16px' }}>{text.final}</p>
        {user.has_password !== false && (
          <label style={{ display: 'block', marginBottom: 14 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: colors.ink, marginBottom: 8 }}>{text.password}</span>
            <input type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)} dir="ltr"
              style={{ width: '100%', maxWidth: 360, height: 46, border: '1.5px solid #d6d9e4', borderRadius: 10, padding: '0 14px', fontSize: 15, boxSizing: 'border-box' }} />
          </label>
        )}
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14.5, color: colors.ink2, lineHeight: 1.8, marginBottom: 16, cursor: 'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 6 }} />
          <span>{text.confirm}</span>
        </label>
        {error && <p role="alert" style={{ color: danger, fontSize: 14, margin: '0 0 12px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={!agreed || busy}
            style={{ background: agreed ? danger : '#d9a7a3', color: '#fff', border: 'none', fontSize: 15, fontWeight: 700, padding: '12px 22px', borderRadius: 10, cursor: agreed && !busy ? 'pointer' : 'not-allowed' }}>
            {busy ? text.working : text.submit}
          </button>
          <Link to="/dashboard/profile?tab=settings" style={{ color: colors.muted, fontWeight: 600 }}>{text.back}</Link>
        </div>
      </form>
    );
  }

  return (
    <div>
      <PageHero breadcrumb={text.breadcrumb} title={text.title} subtitle={text.subtitle} />
      <Container style={{ padding: '40px 24px 60px', maxWidth: 820 }}>
        {!done && (
          <>
            <List title={text.removedTitle} items={text.removed} />
            <List title={text.keptTitle} items={text.kept} />
          </>
        )}
        {body}
      </Container>
    </div>
  );
}
