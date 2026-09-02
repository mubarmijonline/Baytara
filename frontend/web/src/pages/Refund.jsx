import { Container } from '../components/Primitives.jsx';
import PageHero from '../components/PageHero.jsx';
import { colors } from '../theme/tokens.js';
import { useI18n } from '../lib/i18n.jsx';
import { useSiteSettings } from '../lib/site-settings.jsx';

// Refund and cancellation policy. Required by the payment gateway's review, which
// checks the footer for it alongside the privacy policy and the terms.
//
// The Arabic text is the client's own wording, reproduced verbatim — it is the
// binding version, and the English below it is a courtesy translation. Do not
// "improve" the Arabic without the client asking.
//
// ponytail: same call as the privacy page — the text lives here, not in
// site_settings. Move it into an admin editor the first time someone needs to
// edit it without a deploy. The one value that does come from settings is the
// support WhatsApp number, because it was still a placeholder when this shipped.
const UPDATED = { ar: '23 أغسطس 2026', en: '23 August 2026' };

const DOC = {
  ar: [
    {
      title: '١ · طبيعة الخدمات الرقمية',
      body: [
        'جميع الدورات والمواد التعليمية المتاحة على منصة «بَيْطَرَة» هي محتويات رقمية ومقاطع فيديو مسجلة ومتاحة للمشاهدة فور تفعيل الحساب.',
      ],
    },
    {
      title: '٢ · شروط طلب الاسترجاع (استرداد الأموال)',
      body: ['يحق للمشترك تقديم طلب استرداد قيمة الدورة التدريبية وفقاً للشروط التالية مجتمعة:'],
      items: [
        'أن يتم تقديم طلب الاسترجاع خلال ٧ أيام فقط من تاريخ الشراء والدفع.',
        'ألا يكون المشترك قد شاهد أكثر من ٢٠٪ من إجمالي المحتوى المرئي للدورة (يتم تتبع نسبة المشاهدة تلقائياً عبر نظام المنصة).',
        'ألا يكون المشترك قد قام بتنزيل أي من المرفقات أو الملفات التعليمية المرفقة بالدورة (إن وجدت).',
      ],
    },
    {
      title: '٣ · الحالات التي لا يحق فيها الاسترجاع',
      body: ['لا يحق للمستخدم طلب استرداد الأموال في الحالات التالية:'],
      items: [
        'مرور أكثر من ٧ أيام على تاريخ الشراء.',
        'تجاوز نسبة مشاهدة المحتوى ٢٠٪ من إجمالي الدورة.',
        'الاشتراكات التي تمت في العروض الخاصة أو باستخدام كود خصم استثنائي (إلا إذا نص العرض على غير ذلك).',
        'مخالفة العميل لشروط الاستخدام أو محاولة مشاركة الحساب مع أطراف أخرى أو تسجيل الشاشة.',
      ],
    },
    {
      title: '٤ · آلية وإجراءات استرداد الأموال',
      contact: true,
      items: [
        'يجب أن يتضمن الطلب: الاسم المسجل، البريد الإلكتروني، اسم الدورة، ورقم عملية الدفع (Transaction ID).',
        'يتم مراجعة الطلب خلال ٤٨ ساعة عمل للتحقق من نسبة المشاهدة والشروط.',
        'في حال الموافقة، يتم رد المبلغ بنفس طريقة الدفع الأصلية (عبر بوابة Kashier).',
        'قد تستغرق عملية إعادة المبلغ إلى حسابك البنكي أو كارت الدفع مدة تتراوح بين ٥ إلى ١٤ يوم عمل وفقاً لتعليمات البنك المصدر للبطاقة.',
      ],
    },
    {
      title: '٥ · تعديل السياسة',
      body: [
        'تحتفظ منصة «بَيْطَرَة» بالحق في تعديل أو تحديث سياسة الاسترجاع في أي وقت، وتصبح التعديلات نافذة فور نشرها على الموقع.',
      ],
    },
  ],
  en: [
    {
      title: '1 · The nature of the service',
      body: [
        'Every course and learning material on Baytara is digital content: recorded video, available to watch as soon as the account is activated.',
      ],
    },
    {
      title: '2 · When a refund can be requested',
      body: ['A refund may be requested when all of the following conditions are met:'],
      items: [
        'The request is made within 7 days of the purchase and payment date.',
        'No more than 20% of the course video content has been watched (the platform tracks watched percentage automatically).',
        'None of the course attachments or learning files, where these exist, have been downloaded.',
      ],
    },
    {
      title: '3 · When a refund is not available',
      body: ['A refund cannot be requested in the following cases:'],
      items: [
        'More than 7 days have passed since the purchase date.',
        'More than 20% of the course content has been watched.',
        'Purchases made through a special offer or an exceptional discount code, unless the offer states otherwise.',
        'Breach of the terms of use, attempting to share the account with others, or recording the screen.',
      ],
    },
    {
      title: '4 · How a refund is processed',
      contact: true,
      items: [
        'The request must include: the registered name, the email address, the course name, and the payment Transaction ID.',
        'The request is reviewed within 48 working hours to verify the watched percentage and the conditions above.',
        'If approved, the amount is returned by the original payment method (through the Kashier gateway).',
        'The return to your bank account or card may take between 5 and 14 working days, according to the instructions of the issuing bank.',
      ],
    },
    {
      title: '5 · Changes to this policy',
      body: [
        'Baytara reserves the right to amend or update this refund policy at any time. Amendments take effect as soon as they are published on the site.',
      ],
    },
  ],
};

const COPY = {
  ar: {
    breadcrumb: 'الرئيسية › سياسة الاسترجاع والإلغاء',
    title: 'سياسة الاسترجاع والإلغاء',
    updated: 'آخر تحديث',
    intro: 'أهلاً بكم في منصة بَيْطَرَة. نحن نلتزم بتقديم أفضل جودة تعليمية في مجال الطب البيطري. يرجى قراءة سياسة الاسترجاع والإلغاء التالية بعناية قبل الاشتراك في أي من دوراتنا أو خدماتنا الرقمية.',
    contactLead: 'لتقديم طلب الاسترجاع، يرجى التواصل مع فريق الدعم الفني عبر البريد الإلكتروني:',
    whatsapp: 'أو عبر واتساب الدعم الفني على الرقم:',
    binding: '',
  },
  en: {
    breadcrumb: 'Home › Refund and cancellation policy',
    title: 'Refund and cancellation policy',
    updated: 'Last updated',
    intro: 'Welcome to Baytara. We are committed to the highest quality of veterinary education. Please read the following refund and cancellation policy carefully before subscribing to any of our courses or digital services.',
    contactLead: 'To request a refund, please contact our support team by email:',
    whatsapp: 'or on the support WhatsApp number:',
    binding: 'This English text is a translation provided for convenience. The Arabic version of this policy is the binding one.',
  },
};

// The policy names this address itself, so it is not read from site settings: the
// document and the page must not be able to disagree.
const SUPPORT_EMAIL = 'support@baytara.app';

export default function Refund() {
  const { lang } = useI18n();
  const settings = useSiteSettings();
  const key = lang === 'en' ? 'en' : 'ar';
  const copy = COPY[key];
  // Rendered only when a real number is configured — a published placeholder is
  // worse than no WhatsApp line at all, especially on a page a payment gateway reviews.
  const whatsapp = (settings.contact?.whatsapp || settings.socials?.whatsapp || '').trim();

  return (
    <div>
      <PageHero
        breadcrumb={copy.breadcrumb}
        title={copy.title}
        subtitle={`${copy.updated}: ${UPDATED[key]}`}
      />
      <Container style={{ padding: '50px 24px', maxWidth: 820 }}>
        <p style={{ fontSize: 16, color: colors.ink2, lineHeight: 1.95, margin: '0 0 34px' }}>{copy.intro}</p>

        {DOC[key].map((section) => (
          <section key={section.title} style={{ marginBottom: 34 }}>
            <h2 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 12px' }}>{section.title}</h2>
            {(section.body || []).map((paragraph) => (
              <p key={paragraph} style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9, margin: '0 0 10px' }}>
                {paragraph}
              </p>
            ))}
            {section.contact && (
              <p style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9, margin: '0 0 10px' }}>
                {copy.contactLead}{' '}
                <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: colors.accent, fontWeight: 700 }} dir="ltr">
                  {SUPPORT_EMAIL}
                </a>
                {whatsapp && (
                  <>
                    {' '}{copy.whatsapp}{' '}
                    <a href={`https://wa.me/${whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer"
                      style={{ color: colors.accent, fontWeight: 700 }} dir="ltr">
                      {whatsapp}
                    </a>
                  </>
                )}
              </p>
            )}
            {section.items && (
              <ul style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.items.map((item) => (
                  <li key={item} style={{ fontSize: 16, color: colors.muted, lineHeight: 1.9 }}>{item}</li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {copy.binding && (
          <p style={{ fontSize: 13.5, color: colors.muted2, lineHeight: 1.9, margin: 0 }}>{copy.binding}</p>
        )}
      </Container>
    </div>
  );
}
