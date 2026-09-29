// Canned API responses for screenshot runs. NOT part of the shipped app.
//
// Every map here mirrors the real wire shape the DTOs parse, so the screens render exactly
// what they render against the live API. Shapes taken from:
//   /settings          SiteSettings.fromResponse  (nested under "settings")
//   /courses           Paged.fromJson(_, 'courses', ...)
//   /courses/<slug>    {"course": {...}} with "videos" for the curriculum
//   /learning-summary  LearningSummary.fromJson
//   /enrollments       {"enrollments": [...]}
//   /certificates      {"certificates": [...]}
//   /video/playback    the kind:"local" half of the contract
//
// Images are deliberately null everywhere: with no image a card falls back to
// BrandGradients.thumbs, which is the thing worth photographing.
library;

/// Swap for a reachable video to get a real frame in the player shot. Empty is fine for
/// everything else.
const String kDemoVideoUrl = String.fromEnvironment(
  'DEMO_VIDEO_URL',
  defaultValue: 'http://10.0.2.2:8000/demo.mp4',
);

const _instructor = {
  'id': 1,
  'name': 'د. ملك عبد الرحمن',
  'headline': 'استشاري طب وجراحة الحيوانات الصغيرة',
  'avatar_url': null,
  'bio': 'خبرة ستة عشر عاما في جراحة العظام والرخويات، ومدربة معتمدة لطلاب الامتياز.',
  'expertise': ['الجراحة', 'التخدير', 'الأشعة التشخيصية'],
  'courses': 7,
  'lessons': 84,
  'students': 2140,
  'minutes': 1860,
};

const _instructor2 = {
  'id': 2,
  'name': 'د. طارق الشناوي',
  'headline': 'أخصائي أمراض الدواجن والمزارع الإنتاجية',
  'avatar_url': null,
  'expertise': ['الدواجن', 'الأمن الحيوي'],
  'courses': 4,
  'lessons': 46,
  'students': 1310,
  'minutes': 980,
};

const _catSurgery = {'id': 1, 'name': 'الجراحة', 'slug': 'surgery', 'video_count': 34};
const _catPoultry = {'id': 2, 'name': 'الدواجن', 'slug': 'poultry', 'video_count': 21};
const _catCattle = {'id': 3, 'name': 'الماشية', 'slug': 'cattle', 'video_count': 18};
const _catPets = {'id': 4, 'name': 'الحيوانات الأليفة', 'slug': 'pets', 'video_count': 27};

Map<String, dynamic> _course({
  required int id,
  required String slug,
  required String title,
  required String access,
  required bool paid,
  required double price,
  required int lessons,
  required int minutes,
  required double? rating,
  required int reviews,
  required int enrolled,
  String level = 'intermediate',
  Map<String, dynamic> category = _catSurgery,
  Map<String, dynamic> instructor = _instructor,
  List<Map<String, dynamic>> videos = const [],
}) => {
      'id': id,
      'slug': slug,
      'title': title,
      'description':
          'مسار عملي مبني على حالات حقيقية من العيادة، بخطوات مصورة خطوة بخطوة، '
              'ومراجع علمية محدثة في نهاية كل درس.',
      'access_type': access,
      'is_paid': paid,
      'price': price,
      'currency': 'EGP',
      'image': null,
      'level': level,
      'lessons_count': lessons,
      'video_minutes': minutes,
      'access_days': paid ? 365 : null,
      'enrolled_count': enrolled,
      'rating': rating,
      'reviews_count': reviews,
      'has_certificate': true,
      'objectives': const [
        'قراءة الأشعة التشخيصية وتحديد الكسور المركبة',
        'اختيار بروتوكول التخدير المناسب لكل وزن وحالة',
        'إدارة ما بعد الجراحة ومتابعة الالتئام',
      ],
      'category': category,
      'instructor': instructor,
      if (videos.isNotEmpty) 'videos': videos,
    };

List<Map<String, dynamic>> _lessons() => [
      for (var i = 1; i <= 6; i++)
        {
          'id': 100 + i,
          'title': switch (i) {
            1 => 'مقدمة: تقييم الحالة قبل التدخل الجراحي',
            2 => 'التخدير: الحساب بالوزن وبروتوكولات الأمان',
            3 => 'الأشعة التشخيصية وقراءة الكسور المركبة',
            4 => 'التثبيت الداخلي: الشرائح والمسامير',
            5 => 'إغلاق الجرح وإدارة الألم',
            _ => 'المتابعة بعد الجراحة وعلامات الإنذار',
          },
          'access_type': 'free',
          'is_paid': false,
          'lock_reason': null,
          'poster': null,
          'duration_minutes': 12 + i * 3,
          'position': i,
          'has_video': true,
          'is_protected': true,
        },
    ];

final _courses = <Map<String, dynamic>>[
  _course(
    id: 1,
    slug: 'orthopedic-surgery',
    title: 'جراحة العظام للحيوانات الصغيرة',
    access: 'free',
    paid: false,
    price: 0,
    lessons: 6,
    minutes: 142,
    rating: 4.8,
    reviews: 96,
    enrolled: 1240,
    videos: _lessons(),
  ),
  _course(
    id: 2,
    slug: 'poultry-biosecurity',
    title: 'الأمن الحيوي في مزارع الدواجن',
    access: 'general',
    paid: true,
    price: 1200,
    lessons: 14,
    minutes: 310,
    rating: 4.6,
    reviews: 58,
    enrolled: 860,
    category: _catPoultry,
    instructor: _instructor2,
  ),
  _course(
    id: 3,
    slug: 'cattle-reproduction',
    title: 'التناسليات وإدارة الخصوبة في الأبقار',
    access: 'baytarian',
    paid: true,
    price: 1750,
    lessons: 18,
    minutes: 420,
    rating: 4.9,
    reviews: 41,
    enrolled: 512,
    level: 'advanced',
    category: _catCattle,
  ),
  _course(
    id: 4,
    slug: 'small-animal-anesthesia',
    title: 'التخدير الآمن للقطط والكلاب',
    access: 'free',
    paid: false,
    price: 0,
    lessons: 9,
    minutes: 188,
    rating: 4.7,
    reviews: 73,
    enrolled: 1680,
    level: 'beginner',
    category: _catPets,
  ),
  _course(
    id: 5,
    slug: 'clinical-dermatology',
    title: 'الأمراض الجلدية: التشخيص التفريقي',
    access: 'general',
    paid: true,
    price: 950,
    lessons: 11,
    minutes: 236,
    rating: 4.5,
    reviews: 34,
    enrolled: 430,
    category: _catPets,
    instructor: _instructor2,
  ),
  _course(
    id: 6,
    slug: 'emergency-medicine',
    title: 'طب الطوارئ والعناية المركزة',
    access: 'general',
    paid: true,
    price: 1400,
    lessons: 16,
    minutes: 352,
    rating: 4.8,
    reviews: 62,
    enrolled: 720,
    level: 'advanced',
  ),
];

final _videos = <Map<String, dynamic>>[
  {
    'id': 900,
    'title': 'تركيب القسطرة الوريدية في القطط',
    'description': 'خطوة بخطوة، مع أخطاء شائعة وكيف تتجنبها.',
    'access_type': 'free',
    'is_paid': false,
    'lock_reason': null,
    'poster': null,
    'duration_minutes': 14,
    'price': 0,
    'currency': 'EGP',
    'has_video': true,
    'is_protected': true,
    'category': _catPets,
    'instructor': _instructor,
    'can_play': true,
    'requires_auth': false,
    'requires_phone': false,
  },
  {
    'id': 901,
    'title': 'قراءة صورة أشعة للصدر: أين تبدأ',
    'description': 'منهج قراءة منظم لا يترك منطقة بلا فحص.',
    'access_type': 'general',
    'is_paid': true,
    'lock_reason': null,
    'poster': null,
    'duration_minutes': 22,
    'price': 250,
    'currency': 'EGP',
    'has_video': true,
    'is_protected': true,
    'category': _catSurgery,
    'instructor': _instructor,
    'can_play': false,
    'requires_auth': false,
    'requires_phone': false,
  },
  {
    'id': 902,
    'title': 'بروتوكول التحصين في قطعان التسمين',
    'description': 'جدول عملي قابل للتطبيق على المزارع الصغيرة.',
    'access_type': 'free',
    'is_paid': false,
    'lock_reason': null,
    'poster': null,
    'duration_minutes': 18,
    'price': 0,
    'currency': 'EGP',
    'has_video': true,
    'is_protected': false,
    'category': _catPoultry,
    'instructor': _instructor2,
    'can_play': true,
    'requires_auth': false,
    'requires_phone': false,
  },
];

final _settings = <String, dynamic>{
  'settings': {
    'hero': {
      'eyebrow': 'منصة بيطرة التعليمية',
      'subtitle':
          'دورات بيطرية عربية من ممارسين، بمحتوى عملي مبني على حالات حقيقية، '
              'وشهادة معتمدة عند الإتمام.',
      'primary_cta': 'ابدأ التعلم',
      'secondary_cta': 'تصفح الدورات',
      'featured_label': 'الأكثر متابعة',
      'featured_title': 'جراحة العظام للحيوانات الصغيرة',
    },
    'home': {
      'categories_title': 'تصفح حسب التخصص',
      'categories_subtitle': 'اختر مجالك وابدأ من حيث تحتاج',
      'instructors_title': 'نخبة من المحاضرين',
      'instructors_subtitle': 'ممارسون قبل أن يكونوا محاضرين',
      'new_title': 'أحدث الدورات',
      'featured_title': 'دورات مختارة',
      'testimonials_title': 'ماذا يقول المتعلمون',
      'cta_title': 'جاهز تبدأ؟',
      'cta_subtitle': 'أول درس مجاني في كل دورة',
    },
    // The wire key is "num", not "value" (StatItem.fromJson), and it is a pre-formatted
    // string: the widget prints it as-is, forced LTR.
    'stats': [
      {'num': '48', 'label': 'دورة'},
      {'num': '+6,200', 'label': 'متعلم'},
      {'num': '19', 'label': 'محاضر'},
      {'num': '96%', 'label': 'رضا'},
    ],
    'testimonials': [
      {
        'name': 'د. سلمى فؤاد',
        'role': 'طبيبة امتياز، جامعة القاهرة',
        'quote': 'أول مرة ألاقي شرح جراحي بالعربي بالتفصيل ده. غيّر طريقتي في العيادة.',
      },
      {
        'name': 'د. محمود عز',
        'role': 'صاحب عيادة، الإسكندرية',
        'quote': 'المحتوى عملي ومباشر، والشهادة ساعدتني فعليا في التوظيف.',
      },
    ],
  },
};

final _summary = <String, dynamic>{
  'courses_enrolled': 3,
  'watched_hours': 27,
  'streak_days': 6,
  'resume': {
    'course': {'id': 1, 'slug': 'orthopedic-surgery', 'title': 'جراحة العظام للحيوانات الصغيرة'},
    'lesson': {'id': 103, 'title': 'الأشعة التشخيصية وقراءة الكسور المركبة', 'poster': null},
    'lesson_index': 3,
    'total_lessons': 6,
    'remaining_lessons': 3,
    'percent': 45,
  },
};

Map<String, dynamic> _enrollment(
  int id,
  Map<String, dynamic> course,
  int percent,
  int done,
  int total, {
  bool expired = false,
  String? expiresAt,
}) => {
      'id': id,
      'course': course,
      'status': 'active',
      'is_expired': expired,
      'expires_at': expiresAt,
      'source': 'purchase',
      'progress': {
        'percent': percent,
        'completed_lessons': done,
        'total_lessons': total,
        'watched_seconds': done * 900,
      },
    };

final _enrollments = <String, dynamic>{
  'enrollments': [
    _enrollment(11, _courses[0], 45, 3, 6, expiresAt: '2027-03-01T00:00:00'),
    _enrollment(12, _courses[1], 100, 14, 14),
    _enrollment(13, _courses[5], 18, 3, 16, expired: true, expiresAt: '2026-08-20T00:00:00'),
  ],
};

final _certificates = <String, dynamic>{
  'certificates': [
    {
      'serial': 'BYT-2026-0A93F1',
      'learner_name': 'د. أحمد ذياب',
      'issued_at': '2026-08-30T12:00:00',
      'course': {'title': 'الأمن الحيوي في مزارع الدواجن', 'slug': 'poultry-biosecurity'},
    },
    {
      'serial': 'BYT-2026-1C77B4',
      'learner_name': 'د. أحمد ذياب',
      'issued_at': '2026-07-14T12:00:00',
      'course': {'title': 'التخدير الآمن للقطط والكلاب', 'slug': 'small-animal-anesthesia'},
    },
  ],
};

final _notifications = <String, dynamic>{
  'unread': 2,
  'notifications': [
    {
      'id': 1,
      'type': 'baytarian',
      'title': 'تم توثيق حسابك كطبيب بيطري',
      'body': 'صار بإمكانك الوصول إلى محتوى بيطرة الخاص.',
      'is_read': false,
      'created_at': '2026-09-12T09:20:00',
    },
    {
      'id': 2,
      'type': 'payment',
      'title': 'تم تأكيد عملية الشراء',
      'body': 'دورة الأمن الحيوي في مزارع الدواجن متاحة الآن في تعلمي.',
      'is_read': false,
      'created_at': '2026-09-10T18:05:00',
    },
    {
      'id': 3,
      'type': 'security',
      'title': 'تسجيل دخول من جهاز جديد',
      'body': 'إن لم تكن أنت، أزل الجهاز من الإعدادات.',
      'is_read': true,
      'created_at': '2026-09-02T21:40:00',
    },
  ],
};

/// The response body for one request, or null when nothing matches (the adapter then
/// answers 404 so a gap is visible rather than silent).
/// Two book summaries for the library shelf. `has_pdf` is true so the page renders the
/// reader the way it will in the real app; the file request itself is not stubbed.
const _books = [
  {
    'id': 1,
    'slug': 'merck-veterinary-manual',
    'title': 'ملخص دليل ميرك البيطري',
    'book_author': 'Merck & Co.',
    'excerpt': 'ملخص عربي لأهم أبواب الدليل: التشخيص التفريقي، الجرعات، والطوارئ.',
    'cover': null,
    'pages': 48,
    'has_pdf': true,
  },
  {
    'id': 2,
    'slug': 'poultry-diseases-summary',
    'title': 'ملخص أمراض الدواجن',
    'book_author': 'D. E. Swayne',
    'excerpt': 'الأمراض الفيروسية والبكتيرية الشائعة في قطعان التسمين والبياض.',
    'cover': null,
    'pages': 32,
    'has_pdf': true,
  },
];

Map<String, dynamic>? demoBody(String method, String path) {
  // Strip the /api/v1 prefix the base URL carries.
  final p = path.replaceFirst(RegExp(r'^.*?/api/v1'), '');

  if (method == 'POST') {
    if (p == '/video/playback') {
      return {
        'kind': 'local',
        'url': kDemoVideoUrl,
        'session_id': 'demo-session-0001',
        'resume_position_seconds': 0,
        'watermark': 'د. أحمد ذياب · 0100 000 0000',
        'audio_mark': 4210,
      };
    }
    if (p.startsWith('/video/playback-sessions/')) {
      return {'session': {'status': 'active'}};
    }
    return {'ok': true};
  }

  if (p.startsWith('/settings')) return _settings;
  if (p.startsWith('/categories')) {
    return {'categories': [_catSurgery, _catPoultry, _catCattle, _catPets]};
  }
  if (p.startsWith('/courses/')) {
    final slug = p.split('?').first.split('/').last;
    final match = _courses.firstWhere(
      (c) => c['slug'] == slug,
      orElse: () => _courses.first,
    );
    // The detail endpoint is the only one carrying the curriculum.
    return {'course': {...match, 'videos': _lessons()}};
  }
  if (p.startsWith('/courses')) {
    return {
      'courses': _courses,
      'total': _courses.length,
      'page': 1,
      'pages': 1,
      'facets': {
        'level': {'beginner': 2, 'intermediate': 3, 'advanced': 2},
        'access_type': {'free': 2, 'general': 3, 'baytarian': 1},
      },
    };
  }
  if (p.startsWith('/videos/')) {
    return {'video': _videos.first};
  }
  if (p.startsWith('/videos')) {
    return {'videos': _videos, 'total': _videos.length, 'page': 1, 'pages': 1};
  }
  if (p.startsWith('/instructors')) {
    return {'instructors': [_instructor, _instructor2]};
  }
  if (p.startsWith('/bundles')) return {'bundles': [_courses[1], _courses[2]]};
  if (p.startsWith('/paths')) return {'paths': const []};
  if (p.startsWith('/articles')) return {'articles': const []};
  // The library shelf. No PDF is served here: /books/<slug>/file.pdf falls through to
  // demo_fixture_missing, so the reader shows its own failure rather than pretending to
  // open a document the harness does not have.
  if (p.startsWith('/books/')) return {'book': _books.first};
  if (p.startsWith('/books')) return {'books': _books};
  if (p.startsWith('/learning-summary')) return _summary;
  if (p.startsWith('/enrollments')) return _enrollments;
  if (p.startsWith('/certificates/')) {
    return {'certificate': (_certificates['certificates'] as List).first};
  }
  if (p.startsWith('/certificates')) return _certificates;
  if (p.startsWith('/progress')) {
    return {
      'enrolled': true,
      'expired': false,
      'percent': 45,
      'completed': 3,
      'total': 6,
      'expires_at': '2027-03-01T00:00:00',
      'lessons': {
        '101': {'completed': true, 'position_seconds': 0},
        '102': {'completed': true, 'position_seconds': 0},
        '103': {'completed': true, 'position_seconds': 640},
      },
    };
  }
  if (p.startsWith('/video/my-progress')) return {'videos': const []};
  if (p.startsWith('/notifications/unread-count')) return {'unread': 2};
  if (p.startsWith('/notifications')) return _notifications;
  if (p.startsWith('/auth/google-config')) return {'client_id': ''};
  if (p.startsWith('/auth/me')) {
    return {
      'user': {
        'id': 1,
        'name': 'أحمد ذياب',
        'email': 'demo@baytara.app',
        'phone': '+201000000000',
        'role': 'student',
        'is_baytarian': true,
        'is_vet_student': false,
      },
    };
  }
  return null;
}
