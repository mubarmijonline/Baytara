// The privacy policy text.
//
// Ported from frontend/web/src/pages/Privacy.jsx, which holds it as a structured DOC object
// rather than markup. That file says of itself: "a legal document nobody edits weekly does
// not need an admin editor... move it into settings the first time someone asks to edit it."
//
// THIS IS NOW A SECOND COPY. Editing the policy means editing both files, and a privacy
// policy that disagrees with itself is a real problem rather than an untidy one. The proper
// fix, if it is ever edited in anger, is to move the text into the settings CMS so the site
// and the app read one source; until then, treat Privacy.jsx as canonical and mirror it
// here.
//
// Last synced: 2026-08-22, from the web page dated below.

class PrivacySection {
  const PrivacySection({required this.title, this.body = const [], this.items = const []});

  final String title;

  /// Paragraphs.
  final List<String> body;

  /// Bulleted points.
  final List<String> items;
}

abstract final class PrivacyDoc {
  /// When the policy itself was last revised, as printed on the website.
  static const updatedAr = '17 أغسطس 2026';
  static const updatedEn = '17 August 2026';

  static List<PrivacySection> forLocale(String languageCode) =>
      languageCode == 'en' ? _en : _ar;

  static String updatedFor(String languageCode) =>
      languageCode == 'en' ? updatedEn : updatedAr;

  static const _ar = <PrivacySection>[
    PrivacySection(
      title: 'نطاق هذه السياسة',
      body: [
        'تشرح هذه السياسة البيانات التي تجمعها منصة بيطرة عبر موقع baytara.app وتطبيق بيطرة، وكيف نستخدمها ومع من نتشاركها.',
      ],
    ),
    PrivacySection(
      title: 'البيانات التي نجمعها',
      items: [
        'بيانات الحساب: الاسم، البريد الإلكتروني، ورقم الهاتف. كلمة المرور لا تُخزَّن كنص، بل كبصمة مشفّرة (Argon2) لا يمكن استرجاعها.',
        'الدخول بحساب جوجل: نستقبل من جوجل اسمك وبريدك ومعرّف حسابك فقط. لا نطلب صلاحية على Gmail أو Drive أو جهات الاتصال، ولا نرى كلمة مرور حساب جوجل.',
        'الأجهزة: معرّف عشوائي يُنشأ داخل متصفحك، مع وصف المتصفح ووقت آخر استخدام، لتنفيذ حد الجهازين لكل حساب.',
        'سجل المشاهدة: الفيديو، موضع المشاهدة والمدة والأوقات، معرّف الجهاز، عنوان IP، ووصف المتصفح، مرتبطة باسمك وبريدك ورقم هاتفك. الغرض هو حماية المحتوى من النسخ وإعادة النشر.',
        'العلامة المائية: يظهر رقم هاتفك داخل الفيديو أثناء المشاهدة لتتبّع أي تسريب.',
        'المدفوعات عبر إنستاباي: صورة الإيصال التي ترفعها، ويُقرأ منها آلياً المبلغ والرقم المرجعي واسم المُرسل والحساب المُرسل منه، ثم يراجعها فريق الإدارة.',
        'المدفوعات بالبطاقة: تُنفَّذ على صفحة بوابة الدفع المستضافة. لا نستلم ولا نخزّن أرقام البطاقات؛ نحفظ رقم الفاتورة والمبلغ وحالة الدفع وطريقته فقط.',
        'مستندات توثيق الطبيب البيطري: المستندات التي ترفعها لإثبات المهنة، ويراجعها فريق الإدارة.',
        'رسائل التواصل: الاسم والبريد ونص الرسالة عند مراسلتنا.',
      ],
    ),
    PrivacySection(
      title: 'لماذا نجمع هذه البيانات',
      items: [
        'إنشاء حسابك وإتاحة المحتوى الذي اشتركت فيه.',
        'تنفيذ حد الجهازين المنصوص عليه في شروط الاستخدام.',
        'حماية الفيديوهات من التصوير وإعادة النشر عبر العلامة المائية وسجل المشاهدة.',
        'إثبات المدفوعات ومطابقة الإيصالات وحفظ السجلات المالية.',
        'الرد على رسائلك ودعمك الفني.',
      ],
    ),
    PrivacySection(
      title: 'مع من نتشارك البيانات',
      items: [
        'جوجل: تسجيل الدخول بحساب جوجل، وقراءة صور إيصالات إنستاباي آلياً.',
        'VdoCipher: بثّ الفيديو المحمي بتقنية DRM.',
        'بوابة الدفع الإلكتروني: تنفيذ الدفع بالبطاقة والمحافظ.',
        'لا نبيع بياناتك، ولا نشاركها لأغراض إعلانية، ولا نستخدم أدوات تتبّع أو تحليلات خارجية على الموقع.',
      ],
    ),
    PrivacySection(
      title: 'مدة الحفظ',
      items: [
        'بيانات الحساب: طوال بقاء الحساب قائماً.',
        'سجلات المشاهدة: تُحفظ لأغراض مكافحة القرصنة وحماية حقوق المحاضرين.',
        'إيصالات وسجلات الدفع: تُحفظ كسجلات مالية.',
      ],
    ),
    PrivacySection(
      title: 'حقوقك',
      items: [
        'مراجعة بياناتك وتحديث رقم هاتفك من لوحة حسابك.',
        'إزالة أي جهاز مسجَّل على حسابك في أي وقت.',
        'طلب نسخة من بياناتك أو حذف حسابك بمراسلتنا على بريد الدعم.',
      ],
    ),
    PrivacySection(
      title: 'أمن البيانات',
      items: [
        'الاتصال بالموقع مشفَّر بالكامل عبر HTTPS.',
        'كلمات المرور محفوظة كبصمات Argon2، ولا يمكن لأحد قراءتها.',
        'تشغيل الفيديو يتم بتذاكر قصيرة الأجل مربوطة بجهازك وبحسابك.',
      ],
    ),
    PrivacySection(
      title: 'الأطفال',
      body: [
        'المنصة موجهة للأطباء البيطريين وطلاب البيطرة ومربّي الحيوان، ولا نجمع بيانات الأطفال عن قصد.',
      ],
    ),
    PrivacySection(
      title: 'تغييرات على هذه السياسة',
      body: [
        'قد نحدّث هذه الصفحة عند تغيّر طريقة عملنا، ويظهر تاريخ آخر تحديث في أعلى الصفحة.',
      ],
    ),
  ];

  static const _en = <PrivacySection>[
    PrivacySection(
      title: 'Scope',
      body: [
        'This policy explains what data Baytara collects through baytara.app and the Baytara app, how we use it, and who we share it with.',
      ],
    ),
    PrivacySection(
      title: 'Data we collect',
      items: [
        'Account details: name, email address and phone number. Passwords are never stored as text, only as an Argon2 hash that cannot be reversed.',
        'Sign in with Google: Google gives us your name, email address and Google account id, nothing else. We request no access to Gmail, Drive or contacts, and we never see your Google password.',
        'Devices: a random identifier generated inside your browser, plus a browser description and last-used time, used to enforce the two-device limit per account.',
        'Playback records: the video, your position, watched duration and timestamps, the device identifier, IP address and browser description, linked to your name, email and phone. The purpose is protecting content from copying and redistribution.',
        'Watermark: your phone number is shown inside the video while you watch, so any leaked copy can be traced.',
        'InstaPay payments: the receipt image you upload. The amount, reference number, sender name and sender account are read from it automatically, then reviewed by our team.',
        'Card payments: handled on the payment provider hosted page. We never receive or store card numbers, only the invoice id, amount, status and method.',
        'Veterinary verification documents: the documents you upload to prove your profession, reviewed by our team.',
        'Contact messages: your name, email and message text when you write to us.',
      ],
    ),
    PrivacySection(
      title: 'Why we collect it',
      items: [
        'To create your account and give you the content you paid for.',
        'To enforce the two-device limit set out in the terms of use.',
        'To protect videos from recording and redistribution, through the watermark and playback records.',
        'To confirm payments, match receipts and keep financial records.',
        'To answer your messages and provide support.',
      ],
    ),
    PrivacySection(
      title: 'Who we share it with',
      items: [
        'Google: Sign in with Google, and automatic reading of InstaPay receipt images.',
        'VdoCipher: DRM-protected video delivery.',
        'Payment gateway: card and wallet payments.',
        'We do not sell your data, do not share it for advertising, and run no third-party tracking or analytics on the site.',
      ],
    ),
    PrivacySection(
      title: 'How long we keep it',
      items: [
        'Account details: for as long as the account exists.',
        'Playback records: kept for anti-piracy purposes and to protect instructors’ rights.',
        'Receipts and payment records: kept as financial records.',
      ],
    ),
    PrivacySection(
      title: 'Your rights',
      items: [
        'Review your details and update your phone number from your dashboard.',
        'Remove any registered device from your account at any time.',
        'Request a copy of your data, or deletion of your account, by writing to our support address.',
      ],
    ),
    PrivacySection(
      title: 'Security',
      items: [
        'All traffic to the site is encrypted over HTTPS.',
        'Passwords are stored as Argon2 hashes and cannot be read by anyone.',
        'Video playback uses short-lived tickets bound to your account and device.',
      ],
    ),
    PrivacySection(
      title: 'Children',
      body: [
        'The platform is intended for veterinarians, veterinary students and animal keepers. We do not knowingly collect data from children.',
      ],
    ),
    PrivacySection(
      title: 'Changes to this policy',
      body: [
        'We may update this page when our practices change. The date of the last update is shown at the top of the page.',
      ],
    ),
  ];
}
