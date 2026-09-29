// Terms and conditions.
//
// Required by Kashier's merchant review, which checks the footer for this alongside the
// privacy and refund policies before releasing production credentials.
//
// **This is a drafted template, not text the client wrote.** Unlike Refund.jsx — whose
// Arabic is the client's own wording and is binding — everything here was written to
// satisfy the gateway checklist and describes the platform as it actually behaves. It
// should be read by the client, and ideally by a lawyer, before it is relied on. Where it
// states a rule, that rule is one the code already enforces: two devices, capture
// protection, verification for vet-only content.
//
// Section 3 carries an enforcement clause supplied by the client on 2026-09-22, reproduced
// as given with one correction: the source text spelled the platform «بيتارة», which is not
// the brand. A clause that names the wrong entity is a clause worth less than the paper it
// is on, so it reads «بَيْطَرَة» here, as the rest of the document does.
import PolicyDoc from '../components/PolicyDoc.jsx';
import { SUPPORT_EMAIL } from '../lib/support.js';

const UPDATED = { ar: '22 سبتمبر 2026', en: '22 September 2026' };

const DOC = {
  ar: [
    {
      title: '١ · قبول الشروط',
      body: [
        'باستخدامك منصة «بَيْطَرَة» أو إنشاء حساب عليها أو شراء أي دورة، فأنت تقر بأنك قرأت هذه الشروط ووافقت عليها بالكامل. إذا كنت لا توافق على أي بند منها، فالرجاء عدم استخدام المنصة.',
        'قد نقوم بتحديث هذه الشروط من وقت لآخر، وتصبح النسخة المنشورة على الموقع هي النافذة من تاريخ نشرها.',
      ],
    },
    {
      title: '٢ · الحساب والتسجيل',
      items: [
        'الحساب شخصي ولا يجوز مشاركته أو بيعه أو نقله لأي طرف آخر.',
        'يلتزم المستخدم بتقديم بيانات صحيحة عند التسجيل، ومنها رقم هاتف صالح، وهو مطلوب قبل تشغيل المحتوى المحمي لأنه جزء من العلامة المائية.',
        'المستخدم مسؤول عن الحفاظ على سرية بيانات دخوله، وعن أي نشاط يتم من خلال حسابه.',
        'يُسمح بتسجيل الدخول من جهازين اثنين لكل حساب، مع إمكانية تغيير جهاز واحد ذاتياً خلال فترة الاشتراك، وما بعد ذلك يحتاج موافقة الإدارة.',
      ],
    },
    {
      id: 'ip',
      title: '٣ · المحتوى وحقوق الملكية الفكرية',
      body: [
        'جميع الدورات والفيديوهات والمقالات وملخصات الكتب والمواد المرفقة على المنصة مملوكة لـ«بَيْطَرَة» أو لمقدّمي المحتوى المتعاقدين معها، ومحمية بموجب قوانين حقوق الملكية الفكرية.',
      ],
      callout: {
        lead: 'الإجراءات القانونية والمخالفات:',
        text: 'تخضع كافة المواد التعليمية، ومقاطع الفيديو، والملخصات، والملفات المعروضة على منصة وموقع «بَيْطَرَة» لحماية حقوق الملكية الفكرية وحقوق النشر. في حال قيام أي مستخدم أو طرف ثالث باستخدام المحتوى بطريقة غير قانونية، أو نسخه، أو إعادة توزيعه، أو تصويره، أو استغلاله بصورة مخالفة لهذه الشروط، يحق للمنصة والموقع اتخاذ كافة الإجراءات القانونية والقضائية المناسبة فوراً لحفظ حقوقها، بالإضافة إلى الإيقاف الفوري والنهائي لحساب المخالف دون أي التزام برد أي مبالغ مدفوعة.',
      },
      items: [
        'يُمنح المشترك حق وصول شخصي وغير حصري وغير قابل للنقل لمشاهدة المحتوى داخل المنصة فقط، طوال مدة اشتراكه.',
        'يُمنع منعاً باتاً تنزيل المحتوى أو تسجيل الشاشة أو إعادة نشره أو بيعه أو استخدامه في أي عرض تدريبي آخر.',
        'المنصة تستخدم وسائل حماية تقنية وعلامة مائية تحمل بيانات المشاهد، وأي محاولة للتحايل عليها تُعد مخالفة جسيمة.',
      ],
    },
    {
      title: '٤ · المحتوى المخصص للأطباء البيطريين',
      body: [
        'بعض المحتوى متاح فقط للأطباء البيطريين الموثّقين. التوثيق يتم عبر مراجعة مستند مهني، والوصول لهذا المحتوى لا يُفتح بالدفع وحده.',
      ],
    },
    {
      title: '٥ · التزامات المستخدم',
      items: [
        'عدم استخدام المنصة في أي غرض مخالف للقانون أو للآداب العامة.',
        'عدم محاولة الوصول غير المصرح به لأنظمة المنصة أو لحسابات مستخدمين آخرين.',
        'عدم رفع أو مشاركة أي بيانات غير صحيحة أو مستندات لا تخصه أثناء التوثيق.',
        'احترام المدرّبين والمستخدمين الآخرين في أي تفاعل داخل المنصة.',
      ],
    },
    {
      title: '٦ · الدفع والأسعار',
      items: [
        'جميع الأسعار المعروضة بالجنيه المصري (EGP) وشاملة لقيمة الخدمة، ولا توجد رسوم خفية تُضاف عند الدفع.',
        'تتم عمليات الدفع بالبطاقة عبر بوابة Kashier على صفحة دفع آمنة، ولا تستقبل «بَيْطَرَة» ولا تخزّن بيانات بطاقتك.',
        'تحتفظ المنصة بحق تعديل أسعار الدورات مستقبلاً، دون أن يؤثر ذلك على اشتراك تم شراؤه بالفعل.',
      ],
    },
    {
      title: '٧ · الاسترجاع والإلغاء',
      body: [
        'تخضع طلبات استرداد الأموال لسياسة الاسترجاع والإلغاء المنشورة على الموقع، وهي جزء لا يتجزأ من هذه الشروط.',
      ],
    },
    {
      title: '٨ · إيقاف الحساب',
      body: [
        'يحق للمنصة إيقاف أو إلغاء أي حساب يثبت مخالفته لهذه الشروط، وبصفة خاصة مشاركة الحساب أو محاولة تسجيل أو إعادة نشر المحتوى، دون أن يترتب على ذلك حق في استرداد المبالغ المدفوعة.',
      ],
    },
    {
      title: '٩ · حدود المسؤولية',
      body: [
        'المحتوى التعليمي على المنصة لأغراض التطوير المهني، ولا يُغني عن التقدير المهني للطبيب البيطري في الحالات الفردية ولا يُعد استشارة طبية بعينها.',
      ],
    },
    {
      title: '١٠ · القانون الواجب التطبيق والتواصل',
      contact: true,
      body: [
        'تخضع هذه الشروط لأحكام القوانين المعمول بها في جمهورية مصر العربية، وتختص محاكمها بنظر أي نزاع ينشأ عنها.',
      ],
    },
  ],
  en: [
    {
      title: '1 · Acceptance',
      body: [
        'By using Baytara, creating an account, or purchasing a course, you confirm that you have read and accepted these terms in full. If you do not agree with any part of them, please do not use the platform.',
        'We may update these terms from time to time; the version published on the site is the one in force from its publication date.',
      ],
    },
    {
      title: '2 · Accounts',
      items: [
        'An account is personal. It may not be shared, sold or transferred.',
        'You must provide accurate details when registering, including a valid phone number, which is required before protected content will play because it forms part of the watermark.',
        'You are responsible for keeping your credentials confidential and for any activity under your account.',
        'Each account may sign in on two devices, with one self-service device change per subscription period; beyond that an administrator must approve the change.',
      ],
    },
    {
      id: 'ip',
      title: '3 · Content and intellectual property',
      body: [
        'All courses, videos, articles, book summaries and accompanying materials are owned by Baytara or by the instructors contracted with it, and are protected by intellectual property law.',
      ],
      callout: {
        lead: 'Legal action and violations:',
        text: 'All educational materials, videos, summaries and digital documents on the Baytara platform are protected by intellectual property and copyright laws. In the event that any user or third party uses the content in an unlawful or infringing manner — including unauthorised copying, redistribution, recording or exploitation in violation of these terms — the platform expressly reserves the right to pursue all appropriate civil and criminal legal action, in addition to immediately and permanently terminating the offender’s account without liability for any refund.',
      },
      items: [
        'You are granted a personal, non-exclusive, non-transferable right to view the content inside the platform for the duration of your access.',
        'Downloading, screen recording, republishing, reselling or reusing the content in any other training offering is strictly prohibited.',
        'The platform applies technical protection and a watermark carrying the viewer’s details. Any attempt to circumvent these is a serious breach.',
      ],
    },
    {
      title: '4 · Content restricted to veterinarians',
      body: [
        'Some content is available only to verified veterinarians. Verification is carried out by reviewing a professional document, and access to this content is not granted by payment alone.',
      ],
    },
    {
      title: '5 · Your obligations',
      items: [
        'Do not use the platform for any unlawful purpose.',
        'Do not attempt unauthorised access to the platform’s systems or to other users’ accounts.',
        'Do not submit false information or documents belonging to someone else during verification.',
        'Treat instructors and other users with respect in any interaction on the platform.',
      ],
    },
    {
      title: '6 · Payment and pricing',
      items: [
        'All prices are shown in Egyptian Pounds (EGP) and are the full cost of the service. No hidden fees are added at checkout.',
        'Card payments are processed by the Kashier gateway on a secure payment page. Baytara neither receives nor stores your card details.',
        'Prices may change in future; a change does not affect access already purchased.',
      ],
    },
    {
      title: '7 · Refunds and cancellation',
      body: [
        'Refund requests are governed by the refund and cancellation policy published on this site, which forms part of these terms.',
      ],
    },
    {
      title: '8 · Suspension',
      body: [
        'We may suspend or close any account found in breach of these terms, in particular for account sharing or for recording or republishing content, without any entitlement to a refund of amounts already paid.',
      ],
    },
    {
      title: '9 · Limitation of liability',
      body: [
        'The educational content is provided for professional development. It does not replace a veterinarian’s own professional judgement in individual cases and is not specific medical advice.',
      ],
    },
    {
      title: '10 · Governing law and contact',
      contact: true,
      body: [
        'These terms are governed by the laws of the Arab Republic of Egypt, and its courts have jurisdiction over any dispute arising from them.',
      ],
    },
  ],
};

const COPY = {
  ar: {
    breadcrumb: 'الرئيسية › الشروط والأحكام',
    title: 'الشروط والأحكام',
    updated: 'آخر تحديث',
    intro: 'تنظم هذه الشروط استخدامك لمنصة «بَيْطَرَة» للتعليم البيطري. نرجو قراءتها بعناية قبل إنشاء حساب أو الاشتراك في أي دورة.',
    contactLead: 'لأي استفسار بخصوص هذه الشروط، تواصل معنا على:',
  },
  en: {
    breadcrumb: 'Home › Terms and conditions',
    title: 'Terms and conditions',
    updated: 'Last updated',
    intro: 'These terms govern your use of Baytara, the veterinary learning platform. Please read them carefully before creating an account or subscribing to a course.',
    contactLead: 'For any question about these terms, contact us at:',
    binding: 'This English text is a translation provided for convenience. The Arabic version is the binding one.',
  },
};

export default function Terms() {
  return <PolicyDoc doc={DOC} copy={COPY} updated={UPDATED} supportEmail={SUPPORT_EMAIL} />;
}
