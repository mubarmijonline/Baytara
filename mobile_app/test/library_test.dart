// The library: what the app reads off /books, and the one field that was wrong for
// articles.
import 'package:baytara/features/catalogue/data/catalogue_dto.dart';
import 'package:baytara/features/library/data/library_dto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Book parsing', () {
    test('reads a published row', () {
      final b = Book.fromJson({
        'id': 4,
        'slug': 'merck-summary',
        'title': 'ملخص دليل ميرك',
        'book_author': 'Merck & Co.',
        'excerpt': 'ملخص عربي للدليل.',
        'cover': '/api/v1/uploads/merck.jpg',
        'pages': 42,
        'has_pdf': true,
        'status': 'published',
      });

      expect(b.slug, 'merck-summary');
      expect(b.bookAuthor, 'Merck & Co.');
      expect(b.pages, 42);
      expect(b.hasPdf, isTrue);
      expect(b.cover, startsWith('http'),
          reason: 'an upload path is relative and must be resolved against the API origin');
    });

    test('a null page count stays null rather than becoming zero', () {
      final b = Book.fromJson({'slug': 's', 'title': 't', 'pages': null});
      expect(b.pages, isNull,
          reason: 'the server could not read a page count; "0 pages" would be a lie');
    });

    test('has_pdf defaults to false, so a fileless book never opens a reader', () {
      final b = Book.fromJson({'slug': 's', 'title': 't'});
      expect(b.hasPdf, isFalse);
    });

    test('blank strings are dropped rather than rendered as empty lines', () {
      final b = Book.fromJson({
        'slug': 's', 'title': 't', 'book_author': '   ', 'excerpt': '',
      });
      expect(b.bookAuthor, isNull);
      expect(b.excerpt, isNull);
    });
  });

  group('Article parsing', () {
    test('the cover comes from `cover`, which is the key the server emits', () {
      final a = Article.fromJson({
        'slug': 'a', 'title': 't', 'cover': '/api/v1/uploads/a.jpg',
      });
      expect(a.image, isNotNull,
          reason: 'reading `image` left every article cover null');
      expect(a.image, contains('/api/v1/uploads/a.jpg'));
    });
  });
}
