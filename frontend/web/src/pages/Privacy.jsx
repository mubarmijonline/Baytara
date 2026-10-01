import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSiteSettings } from '../lib/site-settings.jsx';

// Privacy policy. Required by the Google Auth Platform branding form (the link
// must live on the authorized domain), and it describes what the platform
// actually stores: account fields, the 2-device record, the playback log behind
// the watermark, and the InstaPay receipt reading.
//
// ponytail: the text lives here rather than in site_settings — a legal document
// nobody edits weekly does not need an admin editor, a settings schema, and a
// migration. Move it into settings the first time someone asks to edit it.
const UPDATED = { ar: '1 أكتوبر 2026', en: '1 October 2026' };

const DOC = {
  ar: [
    {
      title: 'نطاق هذه السياسة',
      body: [
        'تشرح هذه السياسة البيانات التي تجمعها منصة بيطرة عبر موقع baytara.app وتطبيق بيطرة، وكيف نستخدمها ومع من نتشاركها.',
      ],
    },
    {
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
    },
    {
      title: 'لماذا نجمع هذه البيانات',
      items: [
        'إنشاء حسابك وإتاحة المحتوى الذي اشتركت فيه.',
        'تنفيذ حد الجهازين المنصوص عليه في شروط الاستخدام.',
        'حماية الفيديوهات من التصوير وإعادة النشر عبر العلامة المائية وسجل المشاهدة.',
        'إثبات المدفوعات ومطابقة الإيصالات وحفظ السجلات المالية.',
        'الرد على رسائلك ودعمك الفني.',
      ],
    },
    {
      title: 'مع من نتشارك البيانات',
      items: [
        'جوجل: تسجيل الدخول بحساب جوجل، وقراءة صور إيصالات إنستاباي آلياً.',
        'VdoCipher: بثّ الفيديو المحمي بتقنية DRM.',
        'بوابة الدفع الإلكتروني: تنفيذ الدفع بالبطاقة والمحافظ.',
        'لا نبيع بياناتك، ولا نشاركها لأغراض إعلانية، ولا نستخدم أدوات تتبّع أو تحليلات خارجية على الموقع.',
      ],
    },
    {
      title: 'مدة الحفظ',
      items: [
        'بيانات الحساب: طوال بقاء الحساب قائماً.',
        'سجلات المشاهدة: تُحفظ لأغراض مكافحة القرصنة وحماية حقوق المحاضرين.',
        'إيصالات وسجلات الدفع: تُحفظ كسجلات مالية.',
      ],
    },
    {
      title: 'حقوقك',
      items: [
        'مراجعة بياناتك وتحديث رقم هاتفك من لوحة حسابك.',
        'إزالة أي جهاز مسجَّل على حسابك في أي وقت.',
        'حذف حسابك بنفسك في أي وقت من صفحة «حذف الحساب» (baytara.app/account/delete) أو من إعدادات التطبيق.',
        'طلب نسخة من بياناتك بمراسلتنا على بريد الدعم.',
      ],
    },
    {
      title: 'أمن البيانات',
      items: [
        'الاتصال بالموقع مشفَّر بالكامل عبر HTTPS.',
        'كلمات المرور محفوظة كبصمات Argon2، ولا يمكن لأحد قراءتها.',
        'تشغيل الفيديو يتم بتذاكر قصيرة الأجل مربوطة بجهازك وبحسابك.',
      ],
    },
    {
      title: 'الأطفال',
      body: [
        'المنصة موجهة للأطباء البيطريين وطلاب البيطرة ومربّي الحيوان، ولا نجمع بيانات الأطفال عن قصد.',
      ],
    },
    {
      title: 'تغييرات على هذه السياسة',
      body: [
        'قد نحدّث هذه الصفحة عند تغيّر طريقة عملنا، ويظهر تاريخ آخر تحديث في أعلى الصفحة.',
      ],
    },
  ],
  en: [
    {
      title: 'Scope',
      body: [
        'This policy explains what data Baytara collects through baytara.app and the Baytara app, how we use it, and who we share it with.',
      ],
    },
    {
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
    },
    {
      title: 'Why we collect it',
      items: [
        'To create your account and give you the content you paid for.',
        'To enforce the two-device limit set out in the terms of use.',
        'To protect videos from recording and redistribution, through the watermark and playback records.',
        'To confirm payments, match receipts and keep financial records.',
        'To answer your messages and provide support.',
      ],
    },
    {
      title: 'Who we share it with',
      items: [
        'Google: Sign in with Google, and automatic reading of InstaPay receipt images.',
        'VdoCipher: DRM-protected video delivery.',
        'Payment gateway: card and wallet payments.',
        'We do not sell your data, do not share it for advertising, and run no third-party tracking or analytics on the site.',
      ],
    },
    {
      title: 'How long we keep it',
      items: [
        'Account details: for as long as the account exists.',
        'Playback records: kept for anti-piracy purposes and to protect instructors’ rights.',
        'Receipts and payment records: kept as financial records.',
      ],
    },
    {
      title: 'Your rights',
      items: [
        'Review your details and update your phone number from your dashboard.',
        'Remove any registered device from your account at any time.',
        'Delete your account yourself at any time, from the Delete account page (baytara.app/account/delete) or from the app settings.',
        'Request a copy of your data by writing to our support address.',
      ],
    },
    {
      title: 'Security',
      items: [
        'All traffic to the site is encrypted over HTTPS.',
        'Passwords are stored as Argon2 hashes and cannot be read by anyone.',
        'Video playback uses short-lived tickets bound to your account and device.',
      ],
    },
    {
      title: 'Children',
      body: [
        'The platform is intended for veterinarians, veterinary students and animal keepers. We do not knowingly collect data from children.',
      ],
    },
    {
      title: 'Changes to this policy',
      body: [
        'We may update this page when our practices change. The date of the last update is shown at the top of the page.',
      ],
    },
  ],
};

const COPY = {
  ar: {
    breadcrumb: 'الرئيسية › سياسة الخصوصية',
    title: 'سياسة الخصوصية',
    updated: 'آخر تحديث',
    contactTitle: 'التواصل بشأن الخصوصية',
    contactBody: 'لأي سؤال عن بياناتك أو لطلب حذف حسابك، راسلنا على',
  },
  en: {
    breadcrumb: 'Home › Privacy policy',
    title: 'Privacy policy',
    updated: 'Last updated',
    contactTitle: 'Privacy contact',
    contactBody: 'For any question about your data, or to request deletion of your account, write to',
  },
};

export default function Privacy() {
  const { lang } = useI18n();
  const settings = useSiteSettings();
  const key = lang === 'en' ? 'en' : 'ar';
  const copy = COPY[key];
  const email = settings.contact?.email || 'hello@baytara.app';

  return (
    <div>
      <PageHero
        breadcrumb={copy.breadcrumb}
        title={copy.title}
        subtitle={`${copy.updated}: ${UPDATED[key]}`}
      />
      <Container style={{ padding: '50px 24px', maxWidth: 820 }}>
        {DOC[key].map((section) => (
          <section key={section.title} style={{ marginBottom: 34 }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>{section.title}</h2>
            {(section.body || []).map((paragraph) => (
              <p key={paragraph} style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9, margin: '0 0 10px' }}>
                {paragraph}
              </p>
            ))}
            {section.items && (
              <ul style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.items.map((item) => (
                  <li key={item} style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9 }}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        <section style={{ border: `1px solid ${colors.line}`, borderRadius: 18, padding: 26 }}>
          <h2 style={{ fontSize: 20, fontWeight: 900, margin: '0 0 8px' }}>{copy.contactTitle}</h2>
          <p style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9, margin: 0 }}>
            {copy.contactBody}{' '}
            <a href={`mailto:${email}`} style={{ color: colors.accent, fontWeight: 700 }}>{email}</a>
          </p>
        </section>
      </Container>
    </div>
  );
}
