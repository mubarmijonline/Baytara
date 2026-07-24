import { createContext, useContext, useEffect } from 'react';
import { getLang, setLang } from './api.js';

// Chrome/UI strings (contract البند1: full AR/EN). API-driven content is localized
// server-side via ?lang; this dict covers the static shell (nav, buttons, labels).
const DICT = {
  ar: {
    'nav.home': 'الرئيسية', 'nav.courses': 'الكورسات', 'nav.bundles': 'الحزم',
    'nav.instructors': 'المحاضرون', 'nav.pricing': 'الأسعار', 'nav.business': 'للشركات',
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
  },
  en: {
    'nav.home': 'Home', 'nav.courses': 'Courses', 'nav.bundles': 'Bundles',
    'nav.instructors': 'Instructors', 'nav.pricing': 'Pricing', 'nav.business': 'Business',
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
