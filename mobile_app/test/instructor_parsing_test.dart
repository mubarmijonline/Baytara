// Instructor parsing and media URLs.
//
// Two shipped bugs are pinned here, both of which presented as something other than their
// cause:
//
//   1. `expertise` is a LIST on the wire and was cast to String?. The throw happened inside
//      the list comprehension, so it took the whole /instructors response down and surfaced
//      as "something unexpected went wrong" -- not as one missing field.
//   2. Uploaded media comes back as a RELATIVE path ("/api/v1/uploads/x.jpg"). NetworkImage
//      fails silently on those, so no instructor avatar ever appeared and nothing reported
//      an error.
import 'package:baytara/features/catalogue/data/catalogue_dto.dart';
import 'package:flutter_test/flutter_test.dart';

/// Trimmed from a real /instructors response.
Map<String, dynamic> _live() => {
      'id': 225,
      'name': 'د.محمد رفاعي محمود عشبة',
      'headline': 'باحث بمعهد بحوث التناسليات الحيوانيه',
      'avatar_url': '/api/v1/uploads/WhatsApp_Image_2026.jpg',
      'bio': 'باحث متخصص واستشاري',
      'expertise': ['الخيول', 'مزارع الحلاب', 'التناسليات'],
      'specialties': <String>[],
      'category': {'id': 1, 'name': 'طب و جراحة المجترات'},
      'courses': 3,
      'lessons': 2,
      'minutes': 1,
      'students': 0,
    };

void main() {
  group('instructor', () {
    test('parses a real row without throwing', () {
      final i = InstructorRef.fromJson(_live());
      expect(i.id, 225);
      expect(i.coursesCount, 3);
      expect(i.lessonsCount, 2);
    });

    test('expertise is a list, not a string', () {
      // The regression test. Casting this to String? threw and took the whole listing down.
      final i = InstructorRef.fromJson(_live());
      expect(i.expertise, ['الخيول', 'مزارع الحلاب', 'التناسليات']);
    });

    test('a missing expertise is an empty list, not a crash', () {
      final i = InstructorRef.fromJson({'id': 1, 'name': 'x'});
      expect(i.expertise, isEmpty);
      expect(i.specialties, isEmpty);
    });

    test('the trimmed object embedded in a course still parses', () {
      // Courses and videos carry a four-field instructor, without the counts.
      final i = InstructorRef.fromJson({
        'id': 5, 'name': 'د. أحمد', 'headline': 'h',
        'avatar_url': '/api/v1/uploads/a.jpg',
      });
      expect(i.name, 'د. أحمد');
      expect(i.coursesCount, 0);
    });
  });

  group('media URLs', () {
    test('a relative upload path becomes absolute', () {
      final i = InstructorRef.fromJson(_live());
      expect(i.avatarUrl, startsWith('https://'));
      expect(i.avatarUrl, endsWith('/api/v1/uploads/WhatsApp_Image_2026.jpg'));
    });

    test('an already-absolute URL is left alone', () {
      const poster = 'https://dmf9cnjua2s32.cloudfront.net/poster/x.240.jpeg';
      expect(resolveMediaUrl(poster), poster);
    });

    test('empty and null stay null, so no widget tries to fetch them', () {
      expect(resolveMediaUrl(null), isNull);
      expect(resolveMediaUrl(''), isNull);
      expect(resolveMediaUrl('   '), isNull);
    });

    test('a path with no leading slash still resolves', () {
      expect(resolveMediaUrl('uploads/a.jpg'), endsWith('/uploads/a.jpg'));
    });

    test('video posters resolve through the same path', () {
      final v = Video.fromJson({
        'id': 1, 'title': 't', 'access_type': 'free',
        'poster': '/api/v1/uploads/p.jpg',
      });
      expect(v.poster, startsWith('https://'));
    });
  });
}
