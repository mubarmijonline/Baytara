// مكتبة بيطرة — the library, with the same two shelves the website has.
//
// Deliberately open to visitors, article and book page alike. The client's reason for the
// section is that someone arrives for something useful, comes back, and eventually buys a
// course; a wall in front of an article defeats that. Only the summary itself asks for an
// account, and the book page says so before it asks.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/branded_title.dart';
import '../../../core/theme/tokens.dart';
import '../../catalogue/application/catalogue_providers.dart';
import '../../catalogue/data/catalogue_dto.dart';
import '../application/library_providers.dart';
import '../data/library_dto.dart';

class LibraryScreen extends ConsumerStatefulWidget {
  const LibraryScreen({super.key, this.shelf = 'articles'});

  /// `articles` or `books`. The website carries the same choice in `?shelf=`, so a link
  /// shared from either side opens on the same shelf.
  final String shelf;

  @override
  ConsumerState<LibraryScreen> createState() => _LibraryScreenState();
}

class _LibraryScreenState extends ConsumerState<LibraryScreen> {
  late String _shelf = widget.shelf == 'books' ? 'books' : 'articles';

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final books = _shelf == 'books';
    // `blog`, not `content`: the website's library shelf is the blog collection, and the
    // free-content shelf is a different page in both places.
    final articlesAsync = ref.watch(articlesProvider('blog'));
    final booksAsync = ref.watch(booksProvider);

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(l.libraryTitle)),
      body: RefreshIndicator(
        onRefresh: () async => books
            ? ref.invalidate(booksProvider)
            : ref.invalidate(articlesProvider('blog')),
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
          children: [
            Text(l.librarySubtitle,
                style: const TextStyle(
                    fontSize: 13.5, height: 1.8, color: BrandColors.muted)),
            const SizedBox(height: 14),
            _Shelves(
              shelf: _shelf,
              onPick: (next) => setState(() => _shelf = next),
            ),
            const SizedBox(height: 16),
            if (books)
              ...booksAsync.when(
                loading: () => const [_Loading()],
                error: (e, _) => [_Message(asApiException(e).code.message(l))],
                data: (rows) => rows.isEmpty
                    ? [_Message(l.libraryEmpty)]
                    : [for (final b in rows) _BookCard(book: b)],
              )
            else
              ...articlesAsync.when(
                loading: () => const [_Loading()],
                error: (e, _) => [_Message(asApiException(e).code.message(l))],
                data: (rows) => rows.isEmpty
                    ? [_Message(l.libraryEmpty)]
                    : [for (final a in rows) _ArticleCard(article: a)],
              ),
          ],
        ),
      ),
    );
  }
}

class _Shelves extends StatelessWidget {
  const _Shelves({required this.shelf, required this.onPick});

  final String shelf;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return SegmentedButton<String>(
      segments: [
        ButtonSegment(value: 'articles', label: Text(l.libraryArticles)),
        ButtonSegment(value: 'books', label: Text(l.libraryBooks)),
      ],
      selected: {shelf},
      showSelectedIcon: false,
      onSelectionChanged: (s) => onPick(s.first),
    );
  }
}

class _BookCard extends StatelessWidget {
  const _BookCard({required this.book});
  final Book book;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    // The author of the summarised work, then the page count -- but only when the server
    // actually read one out of the file.
    final meta = [
      if (book.bookAuthor != null) book.bookAuthor!,
      if (book.pages != null && book.pages! > 0) l.libraryPages(book.pages!),
    ].join(' · ');

    return _Card(
      cover: book.cover,
      title: book.title,
      meta: meta.isEmpty ? null : meta,
      excerpt: book.excerpt,
      onTap: () => context.push('/library/${book.slug}'),
    );
  }
}

class _ArticleCard extends StatelessWidget {
  const _ArticleCard({required this.article});
  final Article article;

  @override
  Widget build(BuildContext context) => _Card(
        cover: article.image,
        title: article.title,
        excerpt: article.excerpt,
        // Article URLs are unchanged on both sides; only the index moved.
        onTap: () => context.push('/articles/${article.slug}'),
      );
}

class _Card extends StatelessWidget {
  const _Card({
    required this.title,
    required this.onTap,
    this.cover,
    this.meta,
    this.excerpt,
  });

  final String title;
  final VoidCallback onTap;
  final String? cover;
  final String? meta;
  final String? excerpt;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (cover != null && cover!.isNotEmpty)
                AspectRatio(
                  aspectRatio: 16 / 9,
                  child: Image.network(
                    cover!,
                    fit: BoxFit.cover,
                    // A cover that fails to load leaves the card intact rather than
                    // dropping a broken-image box into the shelf.
                    errorBuilder: (_, _, _) =>
                        const ColoredBox(color: BrandColors.surfaceAlt),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w700, height: 1.5)),
                    if (meta != null) ...[
                      const SizedBox(height: 6),
                      Text(meta!,
                          style: const TextStyle(
                              fontSize: 12.5, color: BrandColors.muted2)),
                    ],
                    if (excerpt?.trim().isNotEmpty ?? false) ...[
                      const SizedBox(height: 6),
                      Text(excerpt!,
                          maxLines: 3,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 13, height: 1.7, color: BrandColors.muted)),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      );
}

class _Loading extends StatelessWidget {
  const _Loading();

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.symmetric(vertical: 48),
        child: Center(child: CircularProgressIndicator()),
      );
}

class _Message extends StatelessWidget {
  const _Message(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40, horizontal: 20),
        child: Text(text,
            textAlign: TextAlign.center,
            style: const TextStyle(color: BrandColors.muted2, height: 1.8)),
      );
}
