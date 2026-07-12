// Mock data for the Baytara Main Website (Phase 1).
// Ported from design-systems/baytara/Baytara Home.dc.html renderVals(), then
// re-themed toward the veterinary domain (بيطرة) while keeping the same shapes.
// Replaced by real API data in Phase 3.

import { thumbGradients as g, categoryGradients as cg } from '../theme/tokens.js';

// slugify helper for course routes
export const slugify = (s) =>
  s
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^؀-ۿ\w-]/g, '')
    .toLowerCase();

export const rawCourses = [
  { title: 'أساسيات تشخيص وعلاج أمراض الماشية', instructor: 'د. أحمد الشريف', mentorIdx: 0, ini: 'أ', cat: 'الإنتاج الحيواني', rating: '4.9', lessons: 24, hours: 6, learners: '18.4k', grad: g[0] },
  { title: 'جراحة الحيوانات الصغيرة خطوة بخطوة', instructor: 'د. سارة منصور', mentorIdx: 1, ini: 'س', cat: 'الجراحة البيطرية', rating: '4.8', lessons: 18, hours: 5, learners: '12.1k', grad: g[1] },
  { title: 'التغذية العلاجية للحيوانات المزرعية', instructor: 'د. كريم عادل', mentorIdx: 2, ini: 'ك', cat: 'التغذية', rating: '4.7', lessons: 32, hours: 9, learners: '9.7k', grad: g[2] },
  { title: 'أمراض الدواجن والوقاية منها', instructor: 'د. ليلى حسن', mentorIdx: 3, ini: 'ل', cat: 'الدواجن', rating: '4.9', lessons: 26, hours: 7, learners: '21.3k', grad: g[3] },
  { title: 'التلقيح الاصطناعي وإدارة التكاثر', instructor: 'د. طارق يوسف', mentorIdx: 4, ini: 'ط', cat: 'التكاثر', rating: '4.8', lessons: 15, hours: 4, learners: '15.6k', grad: g[4] },
  { title: 'التصوير التشخيصي والأشعة البيطرية', instructor: 'د. نور الدين', mentorIdx: 2, ini: 'ن', cat: 'التشخيص', rating: '4.9', lessons: 20, hours: 6, learners: '4.2k', grad: g[2] },
  { title: 'صحة القطيع وبرامج المكافحة', instructor: 'د. هبة رمزي', mentorIdx: 4, ini: 'ه', cat: 'الصحة العامة', rating: '4.8', lessons: 14, hours: 4, learners: '3.1k', grad: g[4] },
  { title: 'أساسيات الصيدلة والعلاج البيطري', instructor: 'د. سامي فؤاد', mentorIdx: 0, ini: 'س', cat: 'الأدوية', rating: '4.6', lessons: 28, hours: 8, learners: '2.8k', grad: g[0] },
  { title: 'طب وتربية الخيول العربية', instructor: 'د. دينا خالد', mentorIdx: 1, ini: 'د', cat: 'الخيول', rating: '4.9', lessons: 30, hours: 10, learners: '5.5k', grad: g[1] },
].map((c, i) => ({ ...c, id: i, slug: slugify(c.title) }));

export const stats = [
  { num: '+2000', label: 'دورة بيطرية' },
  { num: '+700', label: 'طبيب وخبير' },
  { num: '+2 مليون', label: 'متعلّم عربي' },
  { num: '+19', label: 'تخصّص بيطري' },
];

export const categories = [
  { name: 'الإنتاج الحيواني', letter: 'إ', count: 320, bg: cg.red },
  { name: 'الجراحة البيطرية', letter: 'ج', count: 280, bg: cg.purple },
  { name: 'أمراض الدواجن', letter: 'د', count: 240, bg: cg.teal },
  { name: 'التغذية والأعلاف', letter: 'ت', count: 190, bg: cg.amber },
  { name: 'التشخيص والمختبرات', letter: 'ت', count: 165, bg: cg.pink },
  { name: 'الصيدلة البيطرية', letter: 'ص', count: 140, bg: cg.blue },
  { name: 'الصحة العامة', letter: 'ص', count: 120, bg: cg.green },
  { name: 'طب الخيول', letter: 'خ', count: 98, bg: cg.violet },
];

export const bizStats = [
  { num: '+900', label: 'عيادة ومزرعة شريكة' },
  { num: '94%', label: 'نسبة الإكمال' },
  { num: '+2000', label: 'دورة متاحة' },
  { num: '24/7', label: 'دعم مخصّص' },
];

export const rawInstructors = [
  { name: 'د. أحمد الشريف', title: 'استشاري أمراض الماشية', ini: 'أ', courses: 12, students: '84k', grad: cg.red },
  { name: 'د. سارة منصور', title: 'أخصائية جراحة بيطرية', ini: 'س', courses: 8, students: '52k', grad: cg.purple },
  { name: 'د. كريم عادل', title: 'خبير تغذية حيوانية', ini: 'ك', courses: 6, students: '38k', grad: cg.teal },
  { name: 'د. ليلى حسن', title: 'استشارية أمراض الدواجن', ini: 'ل', courses: 10, students: '71k', grad: cg.amber },
  { name: 'د. طارق يوسف', title: 'أخصائي تكاثر وتلقيح', ini: 'ط', courses: 9, students: '63k', grad: cg.pink },
].map((m, i) => ({ ...m, id: i }));

export const testimonials = [
  { quote: 'المحتوى البيطري العربي هنا غيّر طريقة عملي في العيادة تماماً. الدورات عملية ومباشرة وأثّرت في مسيرتي المهنية بشكل حقيقي.', name: 'د. محمد الرشيدي', role: 'طبيب بيطري', ini: 'م', grad: cg.purple },
  { quote: 'أخيراً منصة تقدّم معرفة بيطرية احترافية بلغتي. تابعت أكثر من 15 دورة خلال عام وكل واحدة أضافت لي مهارة جديدة.', name: 'د. فاطمة العتيبي', role: 'مربّية ماشية', ini: 'ف', grad: cg.red },
  { quote: 'جودة الإنتاج والمدرّبون على أعلى مستوى. الاشتراك السنوي كان أفضل استثمار في تطوّري المهني هذا العام.', name: 'د. عمر خليل', role: 'طالب بيطرة', ini: 'ع', grad: cg.teal },
];

export const reviews = [
  { name: 'د. خالد المهدي', ini: 'خ', grad: g[0], text: 'من أفضل الدورات التي تابعتها. الشرح واضح والحالات العملية مفيدة جداً.' },
  { name: 'د. ريم السالم', ini: 'ر', grad: g[1], text: 'المدرّب متمكّن والمحتوى مرتّب بشكل رائع. أنصح بها بشدّة.' },
  { name: 'د. يوسف حمدان', ini: 'ي', grad: g[2], text: 'استفدت كثيراً وطبّقت ما تعلّمته في عملي مباشرة. شكراً بيطرة.' },
];

export const levels = ['مبتدئ', 'متوسط', 'متقدّم'];
export const ratingFilters = ['4.5', '4.0', '3.5'];

export const learnPoints = [
  'إتقان الأساسيات النظرية والعملية للتخصّص',
  'تطبيق ما تتعلّمه على حالات سريرية واقعية',
  'بناء منهجية تشخيص منظّمة للحالات المرضية',
  'استخدام أحدث الأدوات والبروتوكولات العلاجية',
  'تطوير مهاراتك لتصل لمستوى الاستشاري',
  'الحصول على شهادة إتمام معتمدة',
];

export const curriculum = [
  { title: 'الوحدة الأولى: المقدمة والأساسيات', count: 4, lessons: [
    { name: 'مرحباً بك في الدورة', dur: '4:20' },
    { name: 'نظرة عامة على المنهج', dur: '8:10' },
    { name: 'المفاهيم الأساسية', dur: '12:45' },
    { name: 'إعداد بيئة العمل', dur: '9:30' } ] },
  { title: 'الوحدة الثانية: التطبيق العملي', count: 3, lessons: [
    { name: 'أول حالة عملية', dur: '15:00' },
    { name: 'دراسة حالة سريرية واقعية', dur: '18:20' },
    { name: 'تمارين تفاعلية', dur: '11:05' } ] },
  { title: 'الوحدة الثالثة: مستوى متقدّم', count: 3, lessons: [
    { name: 'تقنيات متقدّمة', dur: '14:40' },
    { name: 'أفضل الممارسات', dur: '10:15' },
    { name: 'أخطاء شائعة وكيف تتجنّبها', dur: '13:50' } ] },
  { title: 'الوحدة الرابعة: المشروع الختامي', count: 2, lessons: [
    { name: 'بناء بروتوكولك الخاص', dur: '22:00' },
    { name: 'المراجعة والشهادة', dur: '6:30' } ] },
];

export const includes = [
  'وصول مدى الحياة',
  'مشاهدة على جميع الأجهزة',
  'ملفات ومصادر قابلة للتحميل',
  'شهادة إتمام معتمدة',
  'دعم من المجتمع',
];

export const expertise = ['أمراض الماشية', 'صحة القطيع', 'التشخيص السريري', 'الطب الوقائي'];

export const plansData = (annual, accent = '#12285a') => [
  { name: 'الأساسية', tagline: 'للمتعلّم الفردي', featured: false,
    price: annual ? '99' : '149', per: 'شهر', billed: annual ? 'تُدفع سنوياً' : 'تُدفع شهرياً',
    bg: '#fff', fg: '#14142b', border: '1px solid #ececf2', cta: 'ابدأ الآن',
    btnBg: '#fff', btnFg: '#14142b', btnBorder: '1.5px solid #ddd',
    features: ['وصول لكل الدورات', 'مشاهدة على جهازين', 'شهادات إتمام', 'دعم عبر البريد'] },
  { name: 'الاحترافية', tagline: 'الأكثر اختياراً', featured: true,
    price: annual ? '149' : '229', per: 'شهر', billed: annual ? 'تُدفع سنوياً · وفّر 40%' : 'تُدفع شهرياً',
    bg: 'linear-gradient(150deg,#0b1a3f,#12285a)', fg: '#fff', border: '2px solid ' + accent, cta: 'اشترك الآن',
    btnBg: accent, btnFg: '#fff', btnBorder: 'none',
    features: ['كل مزايا الأساسية', 'مشاهدة على 5 أجهزة', 'تحميل للمشاهدة دون اتصال', 'مسارات تعليمية مخصّصة', 'دعم ذو أولوية'] },
  { name: 'المؤسسية', tagline: 'للعيادات والمزارع', featured: false,
    price: annual ? '249' : '349', per: 'شهر', billed: annual ? 'تُدفع سنوياً' : 'تُدفع شهرياً',
    bg: '#fff', fg: '#14142b', border: '1px solid #ececf2', cta: 'ابدأ الآن',
    btnBg: '#fff', btnFg: '#14142b', btnBorder: '1.5px solid #ddd',
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
  { num: '12', label: 'دورة مسجّلة', color: '#12285a' },
  { num: '48', label: 'ساعة تعلّم', color: '#c9a227' },
  { num: '5', label: 'شهادة', color: '#2a5aa0' },
  { num: '7', label: 'أيام متتالية', color: '#8a6d1f' },
];

export const inProgress = [
  { ...rawCourses[0], progress: '65%', remaining: 'باقٍ 8 دروس' },
  { ...rawCourses[3], progress: '30%', remaining: 'باقٍ 18 درس' },
  { ...rawCourses[2], progress: '85%', remaining: 'باقٍ 5 دروس' },
];

export const footerCols = [
  { title: 'المنصة', links: ['كل الدورات', 'المسارات التعليمية', 'الأطباء والمدرّبون', 'الاشتراكات', 'التطبيق'] },
  { title: 'الشركة', links: ['من نحن', 'وظائف', 'المدوّنة', 'الصحافة', 'تواصل معنا'] },
  { title: 'المساعدة', links: ['مركز المساعدة', 'الأسئلة الشائعة', 'كن مدرّباً', 'للأعمال', 'الدعم الفني'] },
];

export const socials = ['f', 'in', 'X', 'IG'];

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
