import { createContext, useContext, useEffect } from 'react';
import { getLang, setLang } from './api.js';

// Chrome/UI strings (contract البند1: full AR/EN). API-driven content is localized
// server-side via ?lang; this dict covers the static shell (nav, buttons, labels).
const DICT = {
  ar: {
    'nav.home': 'الرئيسية', 'nav.courses': 'الكورسات', 'nav.videos': 'الفيديوهات', 'nav.bundles': 'الحزم',
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
    'profile.phoneTitle': 'أكمل رقم هاتفك', 'profile.phoneDescription': 'رقم الهاتف مطلوب لحماية الفيديو بعلامة مائية شخصية.',
    'profile.phoneSave': 'حفظ رقم الهاتف', 'profile.phoneError': 'تعذر حفظ رقم الهاتف.',
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
    'video.libraryTitle': 'مكتبة الفيديو', 'video.librarySubtitle': 'تصفّح الفيديوهات البيطرية حسب التخصص وشاهد المحتوى المتاح لك.',
    'video.searchPlaceholder': 'ابحث في الفيديوهات...', 'video.search': 'بحث', 'video.categories': 'فئات الفيديو',
    'video.allCategories': 'كل التخصصات', 'video.empty': 'لا توجد فيديوهات في هذا التخصص حالياً.',
    'video.loadError': 'تعذر تحميل الفيديوهات.', 'video.open': 'فتح الفيديو', 'video.watch': 'شاهد الفيديو',
    'video.back': 'العودة إلى مكتبة الفيديو', 'video.notFound': 'الفيديو غير موجود', 'video.playError': 'تعذر تشغيل الفيديو الآن.',
    'video.freeForAll': 'مجاني ومتاح للجميع', 'video.homeTitle': 'فيديوهات مجانية للجميع',
    'video.homeSubtitle': 'شاهد أحدث المحتوى البيطري المجاني مباشرة.',
    'video.pagination': 'صفحات الفيديو', 'video.previous': 'السابق', 'video.next': 'التالي', 'video.page': 'صفحة',
    'video.signIn': 'سجّل الدخول للمشاهدة', 'video.accessRequired': 'الوصول مطلوب',
    'video.addPhone': 'أضف رقم الهاتف للمشاهدة',
    'video.registerToWatch': 'سجّل حسابك للمشاهدة', 'video.protectedPlayback': 'تشغيل محمي',
    'video.unlockToWatch': 'افتح للمشاهدة',
    'video.lockedTitle': 'سجّل حسابك لفتح التشغيل المحمي',
    'video.lockedDescription': 'الفيديوهات المجانية تظهر للجميع، لكن التشغيل يحتاج حساباً مفعّلاً لحماية المحتوى والعلامة المائية.',
    'video.watchRequiresAccount': 'أكمل متطلبات الحساب لتشغيل هذا الفيديو.',
    'video.specialty': 'تخصص', 'video.allVideos': 'كل الفيديوهات',
  },
  en: {
    'nav.home': 'Home', 'nav.courses': 'Courses', 'nav.videos': 'Videos', 'nav.bundles': 'Bundles',
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
    'profile.phoneTitle': 'Complete your phone number', 'profile.phoneDescription': 'A phone number is required for the personal video watermark.',
    'profile.phoneSave': 'Save phone number', 'profile.phoneError': 'The phone number could not be saved.',
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
    'video.libraryTitle': 'Video library', 'video.librarySubtitle': 'Browse veterinary videos by specialty and watch the content available to you.',
    'video.searchPlaceholder': 'Search videos...', 'video.search': 'Search', 'video.categories': 'Video categories',
    'video.allCategories': 'All specialties', 'video.empty': 'No videos are available in this specialty yet.',
    'video.loadError': 'Videos could not be loaded.', 'video.open': 'Open video', 'video.watch': 'Watch video',
    'video.back': 'Back to video library', 'video.notFound': 'Video not found', 'video.playError': 'The video cannot be played right now.',
    'video.freeForAll': 'Free for everyone', 'video.homeTitle': 'Free videos for everyone',
    'video.homeSubtitle': 'Watch the latest free veterinary content now.',
    'video.pagination': 'Video pages', 'video.previous': 'Previous', 'video.next': 'Next', 'video.page': 'Page',
    'video.signIn': 'Sign in to watch', 'video.accessRequired': 'Access required',
    'video.addPhone': 'Add phone number to watch',
    'video.registerToWatch': 'Register to watch', 'video.protectedPlayback': 'Protected playback',
    'video.unlockToWatch': 'Unlock to watch',
    'video.lockedTitle': 'Register to unlock protected playback',
    'video.lockedDescription': 'Free videos are visible to everyone, but playback requires an active account for content protection and watermarking.',
    'video.watchRequiresAccount': 'Complete your account requirements to play this video.',
    'video.specialty': 'Specialty', 'video.allVideos': 'All videos',
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
