import { createContext, useContext, useEffect } from 'react';
import { getLang, setLang } from './api.js';

// Chrome/UI strings (contract البند1: full AR/EN). API-driven content is localized
// server-side via ?lang; this dict covers the static shell (nav, buttons, labels).
const DICT = {
  ar: {
    'nav.home': 'الرئيسية', 'nav.courses': 'الكورسات', 'nav.bundles': 'الحزم',
    'nav.instructors': 'المحاضرون', 'nav.pricing': 'العضوية', 'nav.business': 'للشركات',
    'nav.blog': 'المدونة', 'nav.content': 'محتوى مجاني', 'nav.about': 'من نحن',
    'nav.contact': 'تواصل معنا', 'nav.dashboard': 'حسابي', 'nav.login': 'دخول',
    'nav.logout': 'خروج', 'nav.search': 'ابحث عن كورس...',
    'common.egp': 'ج.م', 'common.free': 'مجاني', 'common.loading': 'جارٍ التحميل...',
    'common.enroll': 'اشترك الآن', 'common.viewAll': 'عرض الكل',
    'lang.toggle': 'EN', 'lang.name': 'العربية',
    'bundles.title': 'الحزم التعليمية', 'bundles.subtitle': 'وفّر أكثر مع الحزم المجمّعة',
    'bundles.save': 'وفّر', 'bundles.contains': 'يشمل', 'bundles.courses': 'كورس',
    'bundles.buy': 'اشترِ الحزمة', 'bundles.empty': 'لا توجد حزم متاحة حالياً.',
    'access.expires': 'ينتهي في', 'access.expired': 'انتهت الصلاحية',
    'access.lifetime': 'وصول مدى الحياة', 'access.renew': 'تجديد الاشتراك',
    'access.daysLeft': 'يوم متبقٍ',
    'devices.title': 'الأجهزة', 'devices.limit': 'حد أقصى جهازان لكل حساب',
    'devices.remove': 'إزالة', 'devices.current': 'هذا الجهاز',
    'devices.limitReached': 'وصلت للحد الأقصى (جهازان). أزل جهازاً من حسابك ثم أعد المحاولة.',
    'auth.phone': 'رقم الهاتف', 'auth.phoneHint': 'يظهر كعلامة مائية داخل الفيديو للحماية',
    'renew.pay': 'ادفع للتجديد', 'renew.of': 'من قيمة الكورس',
    'access.free': 'مجاني', 'access.vet_free': 'للأطباء المحاضرين',
    'access.baytarian': 'للأطباء الموثّقين', 'access.general': 'مدفوع',
    'lock.needs_baytarian': 'خاص بالأطباء الموثّقين — وثّق حسابك للوصول',
    'lock.instructors_only': 'خاص بمحاضري بيطرة',
    'membership.title': 'العضوية وأنواع المحتوى', 'membership.subtitle': 'كيف يعمل الوصول للمحتوى في بيطرة',
    'membership.becomeTitle': 'كن طبيباً موثّقاً (بيطريّ)',
    'membership.becomeDesc': 'ارفع مستنداتك (رخصة المزاولة / إثبات أنك طبيب بيطري) ليراجعها الفريق ويوثّق حسابك.',
    'membership.upload': 'ارفع المستندات (PDF أو صور)', 'membership.note': 'ملاحظة (اختياري)',
    'membership.submit': 'إرسال طلب التوثيق', 'membership.pending': 'طلبك قيد المراجعة',
    'membership.approved': 'حسابك موثّق كطبيب بيطري ✅', 'membership.rejected': 'رُفض الطلب',
    'membership.loginFirst': 'سجّل الدخول أولاً لتقديم طلب التوثيق.',
    'membership.verify': 'وثّق حسابك',
  },
  en: {
    'nav.home': 'Home', 'nav.courses': 'Courses', 'nav.bundles': 'Bundles',
    'nav.instructors': 'Instructors', 'nav.pricing': 'Membership', 'nav.business': 'Business',
    'nav.blog': 'Blog', 'nav.content': 'Free content', 'nav.about': 'About',
    'nav.contact': 'Contact', 'nav.dashboard': 'My account', 'nav.login': 'Sign in',
    'nav.logout': 'Sign out', 'nav.search': 'Search for a course...',
    'common.egp': 'EGP', 'common.free': 'Free', 'common.loading': 'Loading...',
    'common.enroll': 'Enroll now', 'common.viewAll': 'View all',
    'lang.toggle': 'ع', 'lang.name': 'English',
    'bundles.title': 'Course bundles', 'bundles.subtitle': 'Save more with grouped bundles',
    'bundles.save': 'Save', 'bundles.contains': 'Includes', 'bundles.courses': 'courses',
    'bundles.buy': 'Buy bundle', 'bundles.empty': 'No bundles available right now.',
    'access.expires': 'Expires on', 'access.expired': 'Access expired',
    'access.lifetime': 'Lifetime access', 'access.renew': 'Renew access',
    'access.daysLeft': 'days left',
    'devices.title': 'Devices', 'devices.limit': 'Max 2 devices per account',
    'devices.remove': 'Remove', 'devices.current': 'This device',
    'devices.limitReached': 'Device limit reached (2). Remove a device from your account and try again.',
    'auth.phone': 'Phone number', 'auth.phoneHint': 'Shown as a watermark over videos for protection',
    'renew.pay': 'Pay to renew', 'renew.of': 'of the course price',
    'access.free': 'Free', 'access.vet_free': 'Instructors only',
    'access.baytarian': 'Verified vets', 'access.general': 'Paid',
    'lock.needs_baytarian': 'For verified vets only — verify your account to access',
    'lock.instructors_only': 'Baytara instructors only',
    'membership.title': 'Membership & content types', 'membership.subtitle': 'How content access works on Baytara',
    'membership.becomeTitle': 'Become a verified vet (Baytarian)',
    'membership.becomeDesc': 'Upload your documents (practice license / proof you are a veterinarian) for the team to review and verify your account.',
    'membership.upload': 'Upload documents (PDF or images)', 'membership.note': 'Note (optional)',
    'membership.submit': 'Submit verification request', 'membership.pending': 'Your request is under review',
    'membership.approved': 'Your account is a verified vet ✅', 'membership.rejected': 'Request rejected',
    'membership.loginFirst': 'Sign in first to submit a verification request.',
    'membership.verify': 'Verify your account',
  },
};

const I18nCtx = createContext(null);

export function I18nProvider({ children }) {
  const lang = getLang();

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
  }, [lang]);

  // Switching language reloads so every data fetch re-runs with the new ?lang.
  function switchLang(next) {
    if (next === lang) return;
    setLang(next);
    window.location.reload();
  }

  const t = (key) => (DICT[lang] && DICT[lang][key]) || DICT.ar[key] || key;
  return <I18nCtx.Provider value={{ lang, t, switchLang }}>{children}</I18nCtx.Provider>;
}

export function useI18n() {
  return useContext(I18nCtx) || { lang: getLang(), t: (k) => (DICT[getLang()] || DICT.ar)[k] || k, switchLang: () => {} };
}
