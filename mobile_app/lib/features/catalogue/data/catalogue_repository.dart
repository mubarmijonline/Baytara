// ignore_for_file: prefer_initializing_formals
// Read-only catalogue access.
//
// Every call sends the bearer token when there is one, even though these endpoints accept
// anonymous callers: the server changes what it returns based on who is asking. A signed-in
// non-vet is not shown `vet_free` items at all, and lock_reason is computed per user. An
// anonymous request would quietly return a different catalogue.
import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';
import 'catalogue_dto.dart';
import 'site_settings.dart';

/// The filter set the courses list offers, mirroring the query parameters
/// `list_courses` accepts in backend/app/api/v1/courses.py.
class CourseQuery {
  const CourseQuery({
    this.page = 1,
    this.perPage = 12,
    this.category,
    this.search,
    this.level,
    this.accessType,
    this.duration,
    this.minRating,
    this.sort = 'newest',
  });

  final int page;

  /// The server caps this at 50.
  final int perPage;
  final String? category;
  final String? search;
  final String? level;
  final String? accessType;

  /// `short` | `medium` | `long`. Hour bands, not a minutes range.
  final String? duration;
  final double? minRating;

  /// popular | newest | oldest | rating | price_asc | price_desc
  final String sort;

  CourseQuery copyWith({
    int? page,
    String? category,
    String? search,
    String? level,
    String? accessType,
    String? duration,
    double? minRating,
    String? sort,
    bool clearCategory = false,
    bool clearLevel = false,
    bool clearAccessType = false,
    bool clearDuration = false,
    bool clearMinRating = false,
  }) =>
      CourseQuery(
        page: page ?? this.page,
        perPage: perPage,
        category: clearCategory ? null : (category ?? this.category),
        search: search ?? this.search,
        level: clearLevel ? null : (level ?? this.level),
        accessType: clearAccessType ? null : (accessType ?? this.accessType),
        duration: clearDuration ? null : (duration ?? this.duration),
        minRating: clearMinRating ? null : (minRating ?? this.minRating),
        sort: sort ?? this.sort,
      );

  /// Only non-empty values are sent. An empty `q=` is not the same as no `q` to a server
  /// that does `if search:` on it, and sending blanks makes the URL harder to read in logs.
  Map<String, dynamic> toParams() => {
        'page': page,
        'per_page': perPage,
        if (category != null && category!.isNotEmpty) 'category': category,
        if (search != null && search!.trim().isNotEmpty) 'q': search!.trim(),
        if (level != null) 'level': level,
        if (accessType != null) 'access_type': accessType,
        if (duration != null) 'duration': duration,
        if (minRating != null && minRating! > 0) 'min_rating': minRating,
        'sort': sort,
      };
}

class VideoQuery {
  const VideoQuery({
    this.page = 1,
    this.perPage = 12,
    this.category,
    this.search,
    this.accessType,
    this.duration,
    this.sort = 'newest',
  });

  final int page;
  final int perPage;
  final String? category;
  final String? search;
  final String? accessType;
  final String? duration;

  /// newest | oldest | longest | shortest. Note this differs from the course sorts: there
  /// is no `popular` or `rating` for videos.
  final String sort;

  VideoQuery copyWith({int? page, String? category, String? search, String? accessType,
          String? duration, String? sort, bool clearCategory = false}) =>
      VideoQuery(
        page: page ?? this.page,
        perPage: perPage,
        category: clearCategory ? null : (category ?? this.category),
        search: search ?? this.search,
        accessType: accessType ?? this.accessType,
        duration: duration ?? this.duration,
        sort: sort ?? this.sort,
      );

  Map<String, dynamic> toParams() => {
        'page': page,
        'per_page': perPage,
        if (category != null && category!.isNotEmpty) 'category': category,
        if (search != null && search!.trim().isNotEmpty) 'q': search!.trim(),
        if (accessType != null) 'access_type': accessType,
        if (duration != null) 'duration': duration,
        'sort': sort,
      };
}

class CatalogueRepository {
  CatalogueRepository({required ApiClient client}) : _client = client;
  final ApiClient _client;
  Dio get _dio => _client.raw;

  Future<List<Category>> categories() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/categories');
      return [
        for (final c in (res.data?['categories'] as List? ?? const []))
          Category.fromJson(c as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<Paged<Course>> courses(CourseQuery query) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/courses',
        queryParameters: query.toParams(),
      );
      return Paged.fromJson(res.data!, 'courses', Course.fromJson);
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<Course> course(String slug) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/courses/$slug');
      return Course.fromJson(res.data!['course'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<Paged<Video>> videos(VideoQuery query) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/videos',
        queryParameters: query.toParams(),
      );
      return Paged.fromJson(res.data!, 'videos', Video.fromJson);
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<Video> video(int id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/videos/$id');
      return Video.fromJson(res.data!['video'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Bundles are returned whole, not paginated.
  Future<List<Course>> bundles() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/bundles');
      return [
        for (final b in (res.data?['bundles'] as List? ?? const []))
          Course.fromJson(b as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<List<InstructorRef>> instructors() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/instructors');
      return [
        for (final i in (res.data?['instructors'] as List? ?? const []))
          InstructorRef.fromJson(i as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Learning paths: ordered runs of courses. Currently empty on the live site, so the
  /// screen hides itself rather than showing an empty tab.
  Future<List<LearningPath>> paths() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/paths');
      return [
        for (final p in (res.data?['paths'] as List? ?? const []))
          LearningPath.fromJson((p as Map).cast<String, dynamic>()),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<LearningPath> path(String slug) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/paths/$slug');
      return LearningPath.fromJson(
          (res.data!['path'] as Map).cast<String, dynamic>());
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// [kind] selects the collection: the blog, or the free-content shelf.
  Future<List<Article>> articles({String? kind}) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/articles',
        queryParameters: {'kind': ?kind},
      );
      return [
        for (final a in (res.data?['articles'] as List? ?? const []))
          Article.fromJson(a as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<Article> article(String slug) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/articles/$slug');
      return Article.fromJson(res.data!['article'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Site copy and configuration. The app renders this rather than hardcoding strings, so
  /// the admin CMS reaches app users the same way it reaches the website.
  ///
  /// Returns the typed model rather than the raw body: the response nests everything under
  /// a `settings` key, and handing callers the wrapper is what made every lookup miss
  /// silently. See site_settings.dart.
  Future<SiteSettings> settings() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/settings');
      return SiteSettings.fromResponse(res.data);
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<void> contact({
    required String name,
    required String email,
    required String message,
  }) async {
    try {
      await _dio.post<dynamic>('/contact', data: {
        'name': name,
        'email': email,
        'message': message,
      });
    } catch (e) {
      throw asApiException(e);
    }
  }
}
