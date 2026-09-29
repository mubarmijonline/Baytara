// Mock data for the Baytara Main Website (Phase 1).
// Ported from design-systems/baytara/Baytara Home.dc.html renderVals(), then
// re-themed toward the veterinary domain (بيطرة) while keeping the same shapes.
// Replaced by real API data in Phase 3.

import { thumbGradients as g, categoryGradients as cg } from '../theme/tokens.js';

export const stats = [
  { num: '+2000', label: 'دورة بيطرية' },
  { num: '+700', label: 'طبيب وخبير' },
  { num: '+2 مليون', label: 'متعلّم عربي' },
  { num: '+19', label: 'تخصّص بيطري' },
];

// Removed with the home-page rebuild: bizStats, rawInstructors and testimonials now come
// from the settings CMS, and the instructor cards from /api/v1/instructors.

// Removed with the course/lesson rebuild: reviews, learnPoints, curriculum, includes and
// expertise are all real data now — course_reviews, courses.objectives, the modules array,
// derived access rows, and users.expertise respectively.

// Removed with the course catalogue rebuild: the course list, the category tiles and the
// level/rating filter chrome are all real now — /api/v1/courses, /api/v1/categories, and
// the level and min_rating filters that listing accepts.

export const plansData = (annual, accent = '#3048A0') => [
  { name: 'الأساسية', tagline: 'للمتعلّم الفردي', featured: false,
    price: annual ? '99' : '149', per: 'شهر', billed: annual ? 'تُدفع سنوياً' : 'تُدفع شهرياً',
    bg: '#fff', fg: '#1E2A5E', border: '1px solid #ececf2', cta: 'ابدأ الآن',
    btnBg: '#fff', btnFg: '#1E2A5E', btnBorder: '1.5px solid #ddd',
    features: ['وصول لكل الدورات', 'مشاهدة على جهازين', 'شهادات إتمام', 'دعم عبر البريد'] },
  { name: 'الاحترافية', tagline: 'الأكثر اختياراً', featured: true,
    price: annual ? '149' : '229', per: 'شهر', billed: annual ? 'تُدفع سنوياً · وفّر 40%' : 'تُدفع شهرياً',
    bg: 'linear-gradient(150deg,#1B2A66,#3048A0)', fg: '#fff', border: '2px solid ' + accent, cta: 'اشترك الآن',
    btnBg: accent, btnFg: '#fff', btnBorder: 'none',
    features: ['كل مزايا الأساسية', 'مشاهدة على 5 أجهزة', 'تحميل للمشاهدة دون اتصال', 'مسارات تعليمية مخصّصة', 'دعم ذو أولوية'] },
  { name: 'المؤسسية', tagline: 'للعيادات والمزارع', featured: false,
    price: annual ? '249' : '349', per: 'شهر', billed: annual ? 'تُدفع سنوياً' : 'تُدفع شهرياً',
    bg: '#fff', fg: '#1E2A5E', border: '1px solid #ececf2', cta: 'ابدأ الآن',
    btnBg: '#fff', btnFg: '#1E2A5E', btnBorder: '1.5px solid #ddd',
    features: ['كل مزايا الاحترافية', '5 حسابات مستقلة', 'لوحة تحكم للفريق', 'تقارير تقدّم', 'فوترة موحّدة'] },
];

export const faqs = [
  { q: 'هل يمكنني إلغاء الاشتراك في أي وقت؟', a: 'نعم، يمكنك الإلغاء متى شئت دون أي رسوم إضافية وتحتفظ بالوصول حتى نهاية فترتك المدفوعة.' },
  { q: 'هل الشهادات معتمدة؟', a: 'جميع الدورات تمنحك شهادة إتمام يمكنك إضافتها إلى سيرتك الذاتية وملفك المهني.' },
  { q: 'هل المحتوى متاح دون اتصال؟', a: 'نعم، في الخطة الاحترافية والمؤسسية يمكنك تحميل الدروس ومشاهدتها دون إنترنت عبر التطبيق.' },
  { q: 'هل هناك فترة تجريبية؟', a: 'نوفّر ضمان استرداد خلال 7 أيام إن لم تكن راضياً عن تجربتك معنا.' },
];

export const bizFeatures = [
  { icon: '↑', bg: cg.red, title: 'محتوى بيطري احترافي', desc: 'أكثر من 2000 دورة في كل التخصّصات، مُحدّثة باستمرار من خبراء المنطقة.' },
  { icon: '▤', bg: cg.purple, title: 'لوحة تحكم للمدراء', desc: 'تابع تقدّم كل عضو في الفريق، وعيّن مسارات تعليمية، وأنشئ فرقاً بسهولة.' },
  { icon: '◷', bg: cg.teal, title: 'تقارير أداء لحظية', desc: 'قِس العائد على الاستثمار عبر تقارير تفصيلية عن ساعات التعلّم والإنجاز.' },
  { icon: '✎', bg: cg.amber, title: 'مسارات مخصّصة', desc: 'صمّم برامج تدريب مصمّمة لاحتياجات عيادتك أو مزرعتك وأهدافها.' },
  { icon: '♦', bg: cg.pink, title: 'شهادات معتمدة', desc: 'امنح فريقك شهادات إتمام تعزّز ملفهم المهني وتحفّزهم.' },
  { icon: '☎', bg: cg.green, title: 'دعم مخصّص 24/7', desc: 'مدير حساب مخصّص ودعم فني على مدار الساعة لضمان أفضل تجربة.' },
];

export const logos = ['عيادة', 'مزرعة', 'مختبر', 'مجموعة', 'اتحاد', 'مركز'];

export const authPerks = [
  'وصول غير محدود لكل الدورات البيطرية',
  'تعلّم بوتيرتك الخاصة',
  'شهادات معتمدة عند الإتمام',
];

export const dashNav = [
  { label: 'الرئيسية', icon: '⌂', active: true },
  { label: 'دوراتي', icon: '▤' },
  { label: 'المفضّلة', icon: '♡' },
  { label: 'الشهادات', icon: '✓' },
  { label: 'الإعدادات', icon: '⚙' },
];

export const dashStats = [
  { num: '12', label: 'دورة مسجّلة', color: '#3048A0' },
  { num: '48', label: 'ساعة تعلّم', color: '#E9BE43' },
  { num: '5', label: 'شهادة', color: '#4356A6' },
  { num: '7', label: 'أيام متتالية', color: '#8a6d1f' },
];

// inProgress went with rawCourses: the dashboard reads real enrollments now.

// footerCols and socials were removed: the footer now links to real routes and reads
// its social URLs from the settings CMS.

// ---- Content used by the new (non-design) pages ----

export const articles = [
  { slug: 'winter-cattle-care', title: 'العناية بالماشية في فصل الشتاء: دليل عملي', excerpt: 'أهم الإجراءات الوقائية للحفاظ على صحة القطيع خلال موجات البرد.', cat: 'رعاية', date: '2026-06-20', read: '6 دقائق', grad: g[0] },
  { slug: 'poultry-biosecurity', title: 'الأمن الحيوي في مزارع الدواجن', excerpt: 'خطوات أساسية لمنع انتشار الأمراض في مزارع الدواجن التجارية.', cat: 'وقاية', date: '2026-06-12', read: '8 دقائق', grad: g[3] },
  { slug: 'equine-nutrition', title: 'أساسيات تغذية الخيول العربية', excerpt: 'كيف تبني نظاماً غذائياً متوازناً يحافظ على لياقة وصحة الخيل.', cat: 'تغذية', date: '2026-05-30', read: '5 دقائق', grad: g[1] },
  { slug: 'vaccination-schedule', title: 'جداول التحصين للحيوانات المزرعية', excerpt: 'مرجع مبسّط لأهم اللقاحات ومواعيدها للأبقار والأغنام.', cat: 'تحصين', date: '2026-05-18', read: '7 دقائق', grad: g[2] },
];

export const freeContent = [
  { title: 'ندوة مباشرة: تشخيص الحالات الطارئة', type: 'بث مباشر', dur: '45 دقيقة', grad: g[4] },
  { title: 'دليل PDF: بروتوكولات الطوارئ البيطرية', type: 'ملف', dur: 'تحميل مجاني', grad: g[0] },
  { title: 'سلسلة فيديو: أساسيات الفحص السريري', type: 'فيديو', dur: '6 حلقات', grad: g[2] },
  { title: 'بودكاست بيطرة: مستجدّات المهنة', type: 'بودكاست', dur: '12 حلقة', grad: g[1] },
];
