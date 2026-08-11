const COPY = {
  ar: {
    heading: 'إعدادات الموقع', subtitle: 'عدّل محتوى التصميم الحالي وشاهد التغييرات قبل الحفظ.',
    tabs: { home: 'الرئيسية', about: 'من نحن', business: 'الأعمال', contact: 'التواصل', footer: 'التذييل', integrations: 'التكاملات' },
    save: 'حفظ الإعدادات', saved: 'تم حفظ الإعدادات.', saveError: 'تعذّر حفظ الإعدادات.', loadError: 'تعذّر تحميل الإعدادات.', loading: 'جارٍ التحميل…',
    sections: { header: 'الشريط العلوي', hero: 'الواجهة الرئيسية', home: 'محتوى الرئيسية', stats: 'الإحصائيات', testimonials: 'آراء المتعلمين', values: 'القيم', business: 'صفحة الأعمال', features: 'المميزات', contact: 'بيانات التواصل', socials: 'روابط التواصل', footer: 'التذييل', fawaterak: 'فواتيرك', vdocipher: 'VdoCipher' },
    fields: { welcome: 'رسالة الترحيب', app: 'التطبيق', help: 'المساعدة', eyebrow: 'النص العلوي', title: 'العنوان', subtitle: 'العنوان الفرعي', primaryCta: 'زر الإجراء الرئيسي', secondaryCta: 'زر الإجراء الثانوي', featuredLabel: 'وسم الدورة المميزة', featuredTitle: 'عنوان الدورة المميزة', testimonialsTitle: 'عنوان الآراء', body: 'النص', tagline: 'الوصف المختصر', copyright: 'حقوق النشر', trust: 'نص الثقة', email: 'البريد الإلكتروني', phone: 'الهاتف', address: 'العنوان', hours: 'ساعات العمل' },
    preview: { title: 'المعاينة المباشرة للموقع', language: 'لغة المعاينة', page: 'صفحة المعاينة', ar: 'العربية', en: 'الإنجليزية' },
    integrations: { mode: 'الوضع', staging: 'اختبار', production: 'إنتاج', clientId: 'OAuth Client ID', clientSecret: 'OAuth Client Secret', hash: 'HASH API Key', vdoSecret: 'VdoCipher API Secret', testVdo: 'اختبار VdoCipher', syncVdo: 'تجهيز مجلدات VdoCipher', connected: 'تم الاتصال بـ VdoCipher.', synced: 'تم تجهيز مجلدات VdoCipher.', connectionError: 'تعذّر الاتصال بـ VdoCipher.', syncError: 'تعذّر تجهيز المجلدات.', mobileRequiresApp: 'قصر المحتوى المحمي على تطبيق بيطرة في الهواتف (متصفّح الهاتف لا يمنع تسجيل الصوت). فعّلها بعد نشر التطبيق.', strictBrowsers: 'قصر المحتوى المحمي على المتصفّحات ذات الحماية العتادية: Safari على أجهزة Apple، Edge على ويندوز، Chrome على أندرويد. يمنع Chrome و Firefox على ويندوز ولينكس (حيث يمكن تسجيل الفيديو بالكامل).' },
  },
  en: {
    heading: 'Site settings', subtitle: 'Edit the current website design and preview changes before saving.',
    tabs: { home: 'Home', about: 'About', business: 'Business', contact: 'Contact', footer: 'Footer', integrations: 'Integrations' },
    save: 'Save settings', saved: 'Settings saved.', saveError: 'Unable to save settings.', loadError: 'Unable to load settings.', loading: 'Loading…',
    sections: { header: 'Top bar', hero: 'Homepage hero', home: 'Homepage content', stats: 'Statistics', testimonials: 'Testimonials', values: 'Values', business: 'Business page', features: 'Features', contact: 'Contact details', socials: 'Social links', footer: 'Footer', fawaterak: 'Fawaterak', vdocipher: 'VdoCipher' },
    fields: { welcome: 'welcome message', app: 'app label', help: 'help label', eyebrow: 'eyebrow', title: 'title', subtitle: 'subtitle', primaryCta: 'primary action', secondaryCta: 'secondary action', featuredLabel: 'featured label', featuredTitle: 'featured course title', testimonialsTitle: 'testimonials title', body: 'body', tagline: 'tagline', copyright: 'copyright', trust: 'trust message', email: 'Email', phone: 'Phone', address: 'address', hours: 'opening hours' },
    preview: { title: 'Website live preview', language: 'Preview language', page: 'Preview page', ar: 'Arabic', en: 'English' },
    integrations: { mode: 'Mode', staging: 'Staging', production: 'Production', clientId: 'OAuth Client ID', clientSecret: 'OAuth Client Secret', hash: 'HASH API Key', vdoSecret: 'VdoCipher API Secret', testVdo: 'Test VdoCipher', syncVdo: 'Prepare VdoCipher folders', connected: 'VdoCipher connection successful.', synced: 'VdoCipher folders prepared.', connectionError: 'Unable to connect to VdoCipher.', syncError: 'Unable to prepare VdoCipher folders.', mobileRequiresApp: 'Restrict protected content to the Baytara app on phones (a mobile browser cannot stop audio being recorded). Turn on after the apps are published.', strictBrowsers: 'Restrict protected content to browsers with hardware DRM: Safari on Apple, Edge on Windows, Chrome on Android. Blocks Chrome/Firefox on Windows and all Linux, where the video can be captured in full.' },
  },
};

export function siteSettingsCopy(language = 'ar') {
  return COPY[language] || COPY.ar;
}
