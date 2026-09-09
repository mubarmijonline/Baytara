// Wire shapes for the catalogue, matching to_dict() in backend/app/models/catalog.py and
// the listing endpoints in backend/app/api/v1/courses.py, video.py and content.py.
//
// Only the fields a screen actually uses are parsed. A DTO that mirrors every column is a
// DTO nobody keeps in sync with the server.
import '../../../core/access/access.dart';
import '../../../core/network/media_url.dart';

// resolveMediaUrl lives in core/network now: the player needs the same rule and must not
// import a catalogue DTO to get it. Re-exported so every existing call site, here and in
// the tests, keeps reading it from this file.
export '../../../core/network/media_url.dart' show resolveMediaUrl;

class Category {
  const Category({
    required this.id,
    required this.name,
    required this.slug,
    this.videoCount = 0,
  });

  factory Category.fromJson(Map<String, dynamic> j) => Category(
        id: (j['id'] as num).toInt(),
        name: j['name'] as String? ?? '',
        slug: j['slug'] as String? ?? '',
        // Only /categories carries this; it is the number on each chip.
        videoCount: (j['video_count'] as num?)?.toInt() ?? 0,
      );

  final int id;
  final String name;
  final String slug;
  final int videoCount;
}

class InstructorRef {
  const InstructorRef({
    required this.id,
    required this.name,
    this.headline,
    this.avatarUrl,
    this.bio,
    this.expertise = const [],
    this.specialties = const [],
    this.coursesCount = 0,
    this.lessonsCount = 0,
    this.studentsCount = 0,
    this.minutes = 0,
  });

  /// Handles both shapes: the trimmed object embedded in a course or video, and the full
  /// row from /instructors, which already carries everything a profile screen needs. No
  /// second request is required to show one.
  factory InstructorRef.fromJson(Map<String, dynamic> j) => InstructorRef(
        id: (j['id'] as num).toInt(),
        name: j['name'] as String? ?? '',
        headline: j['headline'] as String?,
        avatarUrl: resolveMediaUrl(j['avatar_url'] as String?),
        bio: j['bio'] as String?,
        // `expertise` is a LIST on the wire, not a string. Casting it to String threw, and
        // because that happened inside the list parse it took the whole /instructors
        // response down -- which surfaced as "something unexpected went wrong" rather than
        // as one missing field.
        expertise: [
          for (final e in (j['expertise'] as List? ?? const [])) e.toString(),
        ],
        specialties: [
          for (final s in (j['specialties'] as List? ?? const [])) s.toString(),
        ],
        coursesCount: (j['courses'] as num?)?.toInt() ?? 0,
        lessonsCount: (j['lessons'] as num?)?.toInt() ?? 0,
        studentsCount: (j['students'] as num?)?.toInt() ?? 0,
        minutes: (j['minutes'] as num?)?.toInt() ?? 0,
      );

  final int id;
  final String name;
  final String? headline;
  final String? avatarUrl;
  final String? bio;
  final List<String> expertise;
  final List<String> specialties;
  final int coursesCount;
  final int lessonsCount;
  final int studentsCount;
  final int minutes;
}

/// A learning path: an ordered run of courses.
class LearningPath {
  const LearningPath({
    required this.slug,
    required this.title,
    this.description = '',
    this.courses = const [],
  });

  factory LearningPath.fromJson(Map<String, dynamic> j) => LearningPath(
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String? ?? '',
        description: j['description'] as String? ?? '',
        courses: [
          for (final c in (j['courses'] as List? ?? const []))
            Course.fromJson((c as Map).cast<String, dynamic>()),
        ],
      );

  final String slug;
  final String title;
  final String description;
  final List<Course> courses;
}

/// A course as it appears in a listing or on its own page.
class Course {
  const Course({
    required this.id,
    required this.title,
    required this.slug,
    required this.description,
    required this.tier,
    required this.price,
    required this.currency,
    required this.isPaid,
    this.lockReason,
    this.image,
    this.level = 'beginner',
    this.lessonsCount = 0,
    this.videoMinutes = 0,
    this.durationMinutes,
    this.accessDays,
    this.enrolledCount = 0,
    this.rating,
    this.reviewsCount = 0,
    this.hasCertificate = false,
    this.objectives = const [],
    this.category,
    this.instructor,
    this.videos = const [],
  });

  factory Course.fromJson(Map<String, dynamic> j) => Course(
        id: (j['id'] as num).toInt(),
        title: j['title'] as String? ?? '',
        slug: j['slug'] as String? ?? '',
        description: j['description'] as String? ?? '',
        tier: AccessTier.fromWire(j['access_type'] as String?),
        price: (j['price'] as num?)?.toDouble() ?? 0,
        currency: j['currency'] as String? ?? 'EGP',
        isPaid: j['is_paid'] as bool? ?? false,
        lockReason: j['lock_reason'] as String?,
        image: resolveMediaUrl(j['image'] as String?),
        level: j['level'] as String? ?? 'beginner',
        lessonsCount: (j['lessons_count'] as num?)?.toInt() ?? 0,
        // video_minutes is the real summed length; duration_minutes is what an admin typed
        // and is only a fallback. The card should print the real one when it exists.
        videoMinutes: (j['video_minutes'] as num?)?.toInt() ?? 0,
        durationMinutes: (j['duration_minutes'] as num?)?.toInt(),
        accessDays: (j['access_days'] as num?)?.toInt(),
        enrolledCount: (j['enrolled_count'] as num?)?.toInt() ?? 0,
        // Deliberately nullable: the server never sends 0, because a zero would read as a
        // bad course rather than an unrated one.
        rating: (j['rating'] as num?)?.toDouble(),
        reviewsCount: (j['reviews_count'] as num?)?.toInt() ?? 0,
        hasCertificate: j['has_certificate'] as bool? ?? false,
        objectives: [
          for (final o in (j['objectives'] as List? ?? const [])) o.toString(),
        ],
        category: j['category'] == null
            ? null
            : Category.fromJson(j['category'] as Map<String, dynamic>),
        instructor: j['instructor'] == null
            ? null
            : InstructorRef.fromJson(j['instructor'] as Map<String, dynamic>),
        videos: [
          for (final v in (j['videos'] as List? ?? const []))
            Video.fromJson(v as Map<String, dynamic>),
        ],
      );

  final int id;
  final String title;
  final String slug;
  final String description;
  final AccessTier tier;
  final double price;
  final String currency;
  final bool isPaid;
  final String? lockReason;
  final String? image;
  final String level;
  final int lessonsCount;
  final int videoMinutes;
  final int? durationMinutes;
  final int? accessDays;
  final int enrolledCount;
  final double? rating;
  final int reviewsCount;
  final bool hasCertificate;
  final List<String> objectives;
  final Category? category;
  final InstructorRef? instructor;

  /// Populated only on the detail endpoint (`with_content=True`).
  final List<Video> videos;

  /// What the card prints. The summed video length is the truth; the typed figure is a
  /// fallback for a course with nothing attached yet.
  int get displayMinutes => videoMinutes > 0 ? videoMinutes : (durationMinutes ?? 0);

  /// NULL access_days means lifetime, not zero days.
  bool get isLifetime => accessDays == null;
}

/// A video, from `/videos`, `/videos/<id>`, or inside a course tree.
class Video {
  const Video({
    required this.id,
    required this.title,
    required this.tier,
    required this.isPaid,
    this.description = '',
    this.lockReason,
    this.poster,
    this.durationMinutes,
    this.price = 0,
    this.currency = 'EGP',
    this.position = 0,
    this.hasVideo = false,
    this.isProtected = false,
    this.category,
    this.instructor,
    this.canPlay,
    this.requiresAuth,
    this.requiresPhone,
  });

  factory Video.fromJson(Map<String, dynamic> j) => Video(
        id: (j['id'] as num).toInt(),
        title: j['title'] as String? ?? '',
        description: j['description'] as String? ?? '',
        tier: AccessTier.fromWire(j['access_type'] as String?),
        isPaid: j['is_paid'] as bool? ?? false,
        lockReason: j['lock_reason'] as String?,
        poster: resolveMediaUrl(j['poster'] as String?),
        durationMinutes: (j['duration_minutes'] as num?)?.toInt(),
        price: (j['price'] as num?)?.toDouble() ?? 0,
        currency: j['currency'] as String? ?? 'EGP',
        position: (j['position'] as num?)?.toInt() ?? 0,
        hasVideo: j['has_video'] as bool? ?? false,
        isProtected: j['is_protected'] as bool? ?? false,
        category: j['category'] == null
            ? null
            : Category.fromJson(j['category'] as Map<String, dynamic>),
        instructor: j['instructor'] == null
            ? null
            : InstructorRef.fromJson(j['instructor'] as Map<String, dynamic>),
        // Present only on /videos and /videos/<id>. Null inside a course tree, which is
        // why AccessState.resolve has to derive playability rather than read a flag.
        canPlay: j['can_play'] as bool?,
        requiresAuth: j['requires_auth'] as bool?,
        requiresPhone: j['requires_phone'] as bool?,
      );

  final int id;
  final String title;
  final String description;
  final AccessTier tier;
  final bool isPaid;
  final String? lockReason;
  final String? poster;
  final int? durationMinutes;
  final double price;
  final String currency;
  final int position;
  final bool hasVideo;

  /// Capture-protected. Paid videos always are; a free one only when an admin ticked it.
  final bool isProtected;
  final Category? category;
  final InstructorRef? instructor;
  final bool? canPlay;
  final bool? requiresAuth;
  final bool? requiresPhone;
}

/// One page of a paginated listing, plus the facet counts /courses returns.
class Paged<T> {
  const Paged({
    required this.items,
    required this.total,
    required this.page,
    required this.pages,
    this.facets = const {},
  });

  final List<T> items;
  final int total;
  final int page;
  final int pages;

  /// `{dimension: {value: count}}`. The server computes each facet with its own dimension
  /// excluded, so ticking one level does not zero the other level counts.
  final Map<String, Map<String, int>> facets;

  bool get hasMore => page < pages;

  static Paged<T> fromJson<T>(
    Map<String, dynamic> j,
    String key,
    T Function(Map<String, dynamic>) parse,
  ) {
    return Paged<T>(
      items: [
        for (final row in (j[key] as List? ?? const []))
          parse(row as Map<String, dynamic>),
      ],
      total: (j['total'] as num?)?.toInt() ?? 0,
      page: (j['page'] as num?)?.toInt() ?? 1,
      pages: (j['pages'] as num?)?.toInt() ?? 1,
      facets: {
        for (final entry in (j['facets'] as Map? ?? const {}).entries)
          entry.key.toString(): {
            for (final f in (entry.value as Map).entries)
              f.key.toString(): (f.value as num).toInt(),
          },
      },
    );
  }
}

class Article {
  const Article({
    required this.slug,
    required this.title,
    this.excerpt,
    this.body,
    this.image,
    this.publishedAt,
  });

  factory Article.fromJson(Map<String, dynamic> j) => Article(
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String? ?? '',
        excerpt: j['excerpt'] as String?,
        body: j['body'] as String?,
        image: resolveMediaUrl(j['image'] as String?),
        publishedAt: DateTime.tryParse(j['published_at'] as String? ?? ''),
      );

  final String slug;
  final String title;
  final String? excerpt;
  final String? body;
  final String? image;
  final DateTime? publishedAt;
}
