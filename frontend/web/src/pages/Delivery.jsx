// Digital delivery and access policy.
//
// On Kashier's merchant checklist as its own item, and it is the one a gateway cares about
// most for digital goods: it answers "what exactly does the customer receive, and when?"
// A gateway's risk team reads this to understand what a chargeback would be disputing.
//
// Drafted here rather than supplied by the client, and it describes what the platform
// actually does: enrolment is activated by the server-confirmed payment, not by the
// browser coming back from the gateway.
import PolicyDoc from '../components/PolicyDoc.jsx';
import { SUPPORT_EMAIL } from '../lib/support.js';

const UPDATED = { ar: '22 سبتمبر 2026', en: '22 September 2026' };

const DOC = {
  ar: [
    {
      title: '١ · طبيعة الخدمة',
      body: [
        'ما تشتريه من «بَيْطَرَة» هو وصول رقمي إلى دورات وفيديوهات تعليمية تُشاهَد داخل المنصة. لا يتم شحن أي منتج مادي، ولا يُرسل أي ملف بالبريد.',
      ],
    },
    {
      title: '٢ · متى يُفعّل الوصول',
      items: [
        'يُفعّل الوصول تلقائياً وفور تأكيد عملية الدفع من بوابة Kashier، وعادةً خلال ثوانٍ من إتمامها.',
        'التفعيل يعتمد على تأكيد البوابة للدفع وليس على عودة المتصفح لصفحة الموقع، فإذا انقطع الإنترنت بعد الدفع يُفعّل الاشتراك على أي حال.',
        'تجد الدورة بعد التفعيل مباشرةً في «لوحتي» داخل حسابك، وتبدأ المشاهدة من أول درس.',
      ],
    },
    {
      title: '٣ · كيفية الوصول للمحتوى',
      items: [
        'المشاهدة تتم داخل المنصة عبر المتصفح أو تطبيق الموبايل، بعد تسجيل الدخول بنفس الحساب الذي تم الشراء به.',
        'يُسمح بجهازين لكل حساب، ويظهر اسمك ورقم هاتفك كعلامة مائية أثناء التشغيل لحماية المحتوى.',
        'المحتوى غير متاح للتنزيل أو المشاهدة دون اتصال بالإنترنت.',
      ],
    },
    {
      title: '٤ · مدة الوصول',
      body: [
        'مدة الوصول لكل دورة معروضة على صفحتها قبل الشراء، وتبدأ من لحظة التفعيل. بعض الدورات وصولها دائم، وبعضها لمدة محددة يظهر تجديدها في حسابك عند اقترابها من الانتهاء.',
      ],
    },
    {
      title: '٥ · إذا لم يُفعّل الاشتراك',
      contact: true,
      body: [
        'في الحالات النادرة التي يُخصم فيها المبلغ دون أن يظهر الاشتراك خلال ٣٠ دقيقة، تواصل معنا ومعك رقم عملية الدفع (Transaction ID) وسنراجع الحالة ونفعّلها أو نرد المبلغ.',
      ],
    },
  ],
  en: [
    {
      title: '1 · What the service is',
      body: [
        'What you buy from Baytara is digital access to courses and educational videos watched inside the platform. Nothing physical is shipped and no file is emailed.',
      ],
    },
    {
      title: '2 · When access is activated',
      items: [
        'Access is activated automatically as soon as Kashier confirms the payment, normally within seconds of completing it.',
        'Activation depends on the gateway confirming the payment, not on your browser returning to the site, so a dropped connection after paying does not prevent it.',
        'Once activated, the course appears in your dashboard and playback starts from the first lesson.',
      ],
    },
    {
      title: '3 · How the content is accessed',
      items: [
        'Content is watched inside the platform, in a browser or in the mobile app, after signing in with the account used to buy it.',
        'Two devices are allowed per account, and your name and phone number appear as a watermark during playback to protect the content.',
        'Content is not available for download or offline viewing.',
      ],
    },
    {
      title: '4 · Length of access',
      body: [
        'The access period for each course is shown on its page before purchase and starts at activation. Some courses are lifetime; others run for a fixed period and offer renewal in your account as they approach expiry.',
      ],
    },
    {
      title: '5 · If access does not appear',
      contact: true,
      body: [
        'In the rare case that an amount is charged and the subscription has not appeared within 30 minutes, contact us with your transaction ID and we will either activate it or refund it.',
      ],
    },
  ],
};

const COPY = {
  ar: {
    breadcrumb: 'الرئيسية › سياسة تقديم وتفعيل الخدمات',
    title: 'سياسة تقديم وتفعيل الخدمات',
    updated: 'آخر تحديث',
    intro: 'توضح هذه الصفحة ما تحصل عليه عند الشراء من «بَيْطَرَة»، ومتى وكيف يُفعّل وصولك للمحتوى.',
    contactLead: 'للتواصل بخصوص تفعيل اشتراك:',
  },
  en: {
    breadcrumb: 'Home › Digital delivery and access',
    title: 'Digital delivery and access',
    updated: 'Last updated',
    intro: 'This page explains what you receive when you buy from Baytara, and when and how your access is activated.',
    contactLead: 'To contact us about activating a subscription:',
    binding: 'This English text is a translation provided for convenience. The Arabic version is the binding one.',
  },
};

export default function Delivery() {
  return <PolicyDoc doc={DOC} copy={COPY} updated={UPDATED} supportEmail={SUPPORT_EMAIL} />;
}
