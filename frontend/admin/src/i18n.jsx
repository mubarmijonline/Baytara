import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'baytara_admin_language';

const messages = {
  ar: {
    'admin.brand': 'بيطرة · الإدارة',
    'admin.navigation': 'التنقل في الإدارة',
    'nav.dashboard': 'لوحة القيادة',
    'nav.payments': 'المعاملات',
    'nav.baytarian': 'توثيق الأطباء',
    'nav.courses': 'الدورات',
    'nav.videos': 'الفيديوهات',
    'nav.bundles': 'الحزم',
    'nav.hierarchy': 'الهيكلة',
    'nav.categories': 'الفئات',
    'nav.articles': 'المحتوى والمدونة',
    'nav.users': 'المستخدمون',
    'nav.messages': 'الرسائل',
    'nav.settings': 'إعدادات الموقع',
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.confirm': 'تأكيد',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.create': 'إنشاء',
    'common.search': 'بحث',
    'common.refresh': 'تحديث',
    'common.upload': 'رفع',
    'common.import': 'استيراد',
    'common.back': 'رجوع',
    'common.close': 'إغلاق',
    'common.loading': 'جارٍ التحميل…',
    'common.logout': 'تسجيل الخروج',
    'common.changeLanguage': 'تغيير اللغة',
    'catalog.category': 'الفئة',
    'catalog.accessType': 'نوع الوصول',
    'catalog.price': 'السعر',
    'catalog.currency': 'العملة',
    'catalog.accessDays': 'مدة الوصول',
    'catalog.status': 'الحالة',
    'catalog.access.free': 'مجاني للجميع',
    'catalog.access.vet_free': 'مجاني للأطباء الموثقين',
    'catalog.access.baytarian': 'مدفوع للأطباء الموثقين',
    'catalog.access.general': 'مدفوع لغير الأطباء',
    'catalog.status.draft': 'مسودة',
    'catalog.status.published': 'منشور',
    'catalog.status.unpublished': 'غير منشور',
    'errors.generic': 'حدث خطأ.',
    'errors.load': 'تعذّر التحميل.',
    'errors.unauthorized': 'انتهت الجلسة.',
    'pages.notFound': 'الصفحة غير موجودة',
    'pages.videoLibrary': 'مكتبة الفيديوهات',
    'pages.videoNew': 'فيديو جديد',
    'pages.videoDetails': 'تفاصيل الفيديو',
    'pages.courseNew': 'دورة جديدة',
    'pages.courseEdit': 'تعديل الدورة',
    'pages.courseContent': 'محتوى الدورة',
    'pages.bundleNew': 'حزمة جديدة',
    'pages.bundleEdit': 'تعديل الحزمة',
    'pages.articleNew': 'مقال جديد',
    'pages.articleEdit': 'تعديل المقال',
    'pages.paymentReview': 'مراجعة المعاملة',
    'pages.baytarianReview': 'مراجعة توثيق الطبيب',
    'pages.userDetails': 'تفاصيل المستخدم',
    'pages.messageDetails': 'تفاصيل الرسالة',
    'login.title': 'تسجيل دخول الإدارة',
    'login.email': 'البريد الإلكتروني',
    'login.password': 'كلمة المرور',
    'login.submit': 'دخول',
    'login.notAdmin': 'هذا الحساب ليس مسؤولاً.',
    'login.invalid': 'بيانات الدخول غير صحيحة.',
    'login.failed': 'تعذّر تسجيل الدخول.',
  },
  en: {
    'admin.brand': 'Baytara · Admin',
    'admin.navigation': 'Admin navigation',
    'nav.dashboard': 'Dashboard',
    'nav.payments': 'Payments',
    'nav.baytarian': 'Veterinarian verification',
    'nav.courses': 'Courses',
    'nav.videos': 'Videos',
    'nav.bundles': 'Bundles',
    'nav.hierarchy': 'Hierarchy',
    'nav.categories': 'Categories',
    'nav.articles': 'Content and articles',
    'nav.users': 'Users',
    'nav.messages': 'Messages',
    'nav.settings': 'Site settings',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.confirm': 'Confirm',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.create': 'Create',
    'common.search': 'Search',
    'common.refresh': 'Refresh',
    'common.upload': 'Upload',
    'common.import': 'Import',
    'common.back': 'Back',
    'common.close': 'Close',
    'common.loading': 'Loading…',
    'common.logout': 'Log out',
    'common.changeLanguage': 'Change language',
    'catalog.category': 'Category',
    'catalog.accessType': 'Access type',
    'catalog.price': 'Price',
    'catalog.currency': 'Currency',
    'catalog.accessDays': 'Access duration',
    'catalog.status': 'Status',
    'catalog.access.free': 'Free for everyone',
    'catalog.access.vet_free': 'Free for verified veterinarians',
    'catalog.access.baytarian': 'Paid for verified veterinarians',
    'catalog.access.general': 'Paid for non-veterinarians',
    'catalog.status.draft': 'Draft',
    'catalog.status.published': 'Published',
    'catalog.status.unpublished': 'Unpublished',
    'errors.generic': 'Something went wrong.',
    'errors.load': 'Unable to load.',
    'errors.unauthorized': 'Your session has expired.',
    'pages.notFound': 'Page not found',
    'pages.videoLibrary': 'Video Library',
    'pages.videoNew': 'New video',
    'pages.videoDetails': 'Video details',
    'pages.courseNew': 'New course',
    'pages.courseEdit': 'Edit course',
    'pages.courseContent': 'Course content',
    'pages.bundleNew': 'New bundle',
    'pages.bundleEdit': 'Edit bundle',
    'pages.articleNew': 'New article',
    'pages.articleEdit': 'Edit article',
    'pages.paymentReview': 'Payment review',
    'pages.baytarianReview': 'Veterinarian review',
    'pages.userDetails': 'User details',
    'pages.messageDetails': 'Message details',
    'login.title': 'Admin sign in',
    'login.email': 'Email',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.notAdmin': 'This account is not an administrator.',
    'login.invalid': 'Incorrect sign-in details.',
    'login.failed': 'Unable to sign in.',
  },
};

const LanguageContext = createContext(null);

function storedLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}

export function t(key, language = 'ar') {
  return messages[language]?.[key] ?? messages.ar[key] ?? key;
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(storedLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch {
      // The selected language still applies for this session when storage is unavailable.
    }
  }, [language]);

  const setLanguage = useCallback((nextLanguage) => {
    setLanguageState(nextLanguage === 'en' ? 'en' : 'ar');
  }, []);
  const translate = useCallback((key) => t(key, language), [language]);
  const value = useMemo(() => ({
    language,
    direction: language === 'ar' ? 'rtl' : 'ltr',
    setLanguage,
    t: translate,
  }), [language, setLanguage, translate]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useAdminLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useAdminLanguage must be used within LanguageProvider');
  return value;
}
