// Catalogue parsing and query building.
//
// Most of this guards against reading a field the way it looks rather than the way the
// server means it: rating null is "unrated" not "zero", access_days null is "lifetime" not
// "no access", and duration 0 is "unknown length" not "instant".
import 'package:baytara/core/access/access.dart';
import 'package:baytara/features/catalogue/data/catalogue_dto.dart';
import 'package:baytara/features/catalogue/data/catalogue_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Course parsing', () {
    test('reads a full listing row', () {
      final c = Course.fromJson({
        'id': 3,
        'title': 'تشريح',
        'slug': 'anatomy',
        'description': 'd',
        'access_type': 'baytarian',
        'price': 450.0,
        'currency': 'EGP',
        'is_paid': true,
        'lock_reason': 'needs_baytarian',
        'level': 'intermediate',
        'lessons_count': 12,
        'video_minutes': 190,
        'duration_minutes': 120,
        'access_days': 90,
        'enrolled_count': 41,
        'rating': 4.5,
        'reviews_count': 8,
        'has_certificate': true,
        'objectives': ['a', 'b'],
        'category': {'id': 1, 'name': 'باطنة', 'slug': 'internal'},
        'instructor': {'id': 5, 'name': 'د. أحمد', 'headline': 'h', 'avatar_url': null},
      });

      expect(c.tier, AccessTier.baytarian);
      expect(c.lockReason, 'needs_baytarian');
      expect(c.objectives, ['a', 'b']);
      expect(c.category!.slug, 'internal');
      expect(c.instructor!.name, 'د. أحمد');
      expect(c.isLifetime, isFalse);
    });

    test('the real video length wins over the admin-typed duration', () {
      final withVideos = Course.fromJson({
        'id': 1, 'title': 't', 'slug': 's', 'description': '',
        'video_minutes': 190, 'duration_minutes': 120,
      });
      expect(withVideos.displayMinutes, 190);

      // Nothing attached yet: fall back to what the admin typed.
      final empty = Course.fromJson({
        'id': 2, 'title': 't', 'slug': 's', 'description': '',
        'video_minutes': 0, 'duration_minutes': 120,
      });
      expect(empty.displayMinutes, 120);
    });

    test('a null rating means unrated, and is never turned into zero', () {
      final c = Course.fromJson(
          {'id': 1, 'title': 't', 'slug': 's', 'description': '', 'rating': null});
      expect(c.rating, isNull,
          reason: 'a 0 would read as a bad course rather than a new one');
    });

    test('null access_days means lifetime', () {
      final c = Course.fromJson(
          {'id': 1, 'title': 't', 'slug': 's', 'description': '', 'access_days': null});
      expect(c.isLifetime, isTrue);
    });

    test('a missing access_type falls back to a paid tier, not a free one', () {
      final c = Course.fromJson({'id': 1, 'title': 't', 'slug': 's', 'description': ''});
      expect(c.tier, AccessTier.general, reason: 'fail closed');
    });
  });

  group('Video parsing', () {
    test('/videos rows carry the authoritative playability flags', () {
      final v = Video.fromJson({
        'id': 9, 'title': 'v', 'access_type': 'free', 'is_paid': false,
        'can_play': true, 'requires_auth': false, 'requires_phone': false,
        'has_video': true, 'is_protected': false,
      });
      expect(v.canPlay, isTrue);
      expect(v.requiresPhone, isFalse);
    });

    test('a course-tree row has no can_play at all', () {
      // This is the whole reason AccessState derives playability instead of reading a flag.
      final v = Video.fromJson({
        'id': 9, 'title': 'v', 'access_type': 'baytarian', 'is_paid': true,
        'lock_reason': 'needs_baytarian', 'has_video': true,
      });
      expect(v.canPlay, isNull);
      expect(v.requiresAuth, isNull);
      expect(v.lockReason, 'needs_baytarian');
    });
  });

  group('Paged', () {
    test('reads items, totals and the facet block', () {
      final p = Paged.fromJson<Course>({
        'courses': [
          {'id': 1, 'title': 'a', 'slug': 'a', 'description': ''},
          {'id': 2, 'title': 'b', 'slug': 'b', 'description': ''},
        ],
        'total': 30,
        'page': 2,
        'pages': 3,
        'facets': {
          'level': {'beginner': 12, 'intermediate': 8, 'advanced': 0},
          'access_type': {'free': 4, 'vet_free': 2, 'baytarian': 20, 'general': 4},
        },
      }, 'courses', Course.fromJson);

      expect(p.items.length, 2);
      expect(p.total, 30);
      expect(p.hasMore, isTrue, reason: 'page 2 of 3');
      expect(p.facets['level']!['beginner'], 12);
      expect(p.facets['level']!['advanced'], 0,
          reason: 'a zero facet is real information: that combination is empty');
      expect(p.facets['access_type']!['baytarian'], 20);
    });

    test('the last page has no more', () {
      final p = Paged.fromJson<Course>(
          {'courses': [], 'total': 0, 'page': 1, 'pages': 1}, 'courses', Course.fromJson);
      expect(p.hasMore, isFalse);
      expect(p.facets, isEmpty);
    });
  });

  group('CourseQuery', () {
    test('sends only the filters that are set', () {
      final params = const CourseQuery().toParams();
      expect(params.keys, containsAll(['page', 'per_page', 'sort']));
      expect(params.containsKey('category'), isFalse);
      expect(params.containsKey('q'), isFalse);
      expect(params.containsKey('min_rating'), isFalse);
    });

    test('a blank search is omitted rather than sent empty', () {
      // The server does `if search:`, so `q=` and no `q` behave the same; sending blanks
      // only makes the URL harder to read in a log.
      expect(const CourseQuery(search: '   ').toParams().containsKey('q'), isFalse);
      expect(const CourseQuery(search: 'anatomy').toParams()['q'], 'anatomy');
    });

    test('a search is trimmed', () {
      expect(const CourseQuery(search: '  anatomy  ').toParams()['q'], 'anatomy');
    });

    test('a zero minimum rating is not a filter', () {
      expect(const CourseQuery(minRating: 0).toParams().containsKey('min_rating'), isFalse);
      expect(const CourseQuery(minRating: 4).toParams()['min_rating'], 4);
    });

    test('clear flags remove a filter rather than leaving the old value', () {
      const q = CourseQuery(category: 'internal', level: 'beginner');
      expect(q.copyWith(clearCategory: true).category, isNull);
      expect(q.copyWith(clearCategory: true).level, 'beginner',
          reason: 'clearing one filter must not disturb the others');
    });

    test('applying a filter resets to page 1 when the caller says so', () {
      const q = CourseQuery(page: 4);
      expect(q.copyWith(page: 1).page, 1);
    });
  });

  group('VideoQuery', () {
    test('offers the sorts the video endpoint actually supports', () {
      // No `popular` or `rating` here: /videos orders by created_at or duration only.
      expect(const VideoQuery(sort: 'longest').toParams()['sort'], 'longest');
      expect(const VideoQuery().toParams()['sort'], 'newest');
    });

    test('omits an unset category', () {
      expect(const VideoQuery().toParams().containsKey('category'), isFalse);
      expect(const VideoQuery(category: 'surgery').toParams()['category'], 'surgery');
    });
  });
}
