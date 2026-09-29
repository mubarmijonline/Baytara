// مكتبة بيطرة — the library, as the app sees it.
//
// A `Book` here is a **summary** of a published work written by Baytara, never the work
// itself; the model comment in backend/app/models/content.py explains why that distinction
// is not cosmetic. The metadata is public so a book has a page that can be found and
// shared, and only the PDF asks for an account.
import '../../../core/network/media_url.dart';

class Book {
  const Book({
    required this.slug,
    required this.title,
    this.bookAuthor,
    this.excerpt,
    this.cover,
    this.pages,
    this.hasPdf = false,
  });

  factory Book.fromJson(Map<String, dynamic> j) => Book(
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String? ?? '',
        // Whose book was summarised, not who wrote the summary.
        bookAuthor: _trimmed(j['book_author'] as String?),
        excerpt: _trimmed(j['excerpt'] as String?),
        cover: resolveMediaUrl(j['cover'] as String?),
        // Null means the server could not read a page count out of the file, not zero
        // pages. Shown only when it is a real number.
        pages: (j['pages'] as num?)?.toInt(),
        // A published book always has a file (the admin API refuses to publish one
        // without), but a draft reaching the app by any route must not offer a reader
        // that would 404.
        hasPdf: j['has_pdf'] as bool? ?? false,
      );

  final String slug;
  final String title;
  final String? bookAuthor;
  final String? excerpt;
  final String? cover;
  final int? pages;
  final bool hasPdf;

  static String? _trimmed(String? value) {
    final v = value?.trim();
    return (v == null || v.isEmpty) ? null : v;
  }
}
