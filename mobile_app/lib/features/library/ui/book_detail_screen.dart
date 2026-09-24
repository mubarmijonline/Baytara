// One book summary: a public page, and the summary itself for anyone signed in.
//
// The split is the website's, and it is deliberate. A page nobody can open cannot be
// shared or found, and the account is what reading is for.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/links/share_button.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/domain/session.dart';
import '../application/library_providers.dart';
import '../data/library_dto.dart';
import 'book_reader.dart';

class BookDetailScreen extends ConsumerWidget {
  const BookDetailScreen({super.key, required this.slug});

  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(bookProvider(slug));

    return Scaffold(
      appBar: AppBar(
        title: Text(l.libraryBooks),
        actions: [
          // Only once the book is loaded: sharing a link whose title is still unknown
          // would send a colleague a bare URL.
          if (async.value case final book?)
            ShareLinkButton(location: '/library/${book.slug}', title: book.title),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(asApiException(e).code.message(l),
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.muted, height: 1.8)),
          ),
        ),
        data: (book) => _Body(book: book),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.book});
  final Book book;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final signedIn = ref.watch(sessionProvider) is SessionSignedIn;

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 28),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (book.cover != null && book.cover!.isNotEmpty) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: Image.network(book.cover!,
                    width: 96,
                    fit: BoxFit.cover,
                    errorBuilder: (_, _, _) => const SizedBox.shrink()),
              ),
              const SizedBox(width: 14),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(book.title,
                      style: const TextStyle(
                          fontSize: 19, fontWeight: FontWeight.w800, height: 1.5)),
                  if (book.bookAuthor != null) ...[
                    const SizedBox(height: 6),
                    Text(book.bookAuthor!,
                        style: const TextStyle(
                            fontSize: 13.5, color: BrandColors.muted2)),
                  ],
                  if (book.pages != null && book.pages! > 0) ...[
                    const SizedBox(height: 4),
                    Text(l.libraryPages(book.pages!),
                        style: const TextStyle(
                            fontSize: 12.5, color: BrandColors.muted2)),
                  ],
                ],
              ),
            ),
          ],
        ),
        if (book.excerpt != null) ...[
          const SizedBox(height: 14),
          Text(book.excerpt!,
              style: const TextStyle(
                  fontSize: 14, height: 1.9, color: BrandColors.muted)),
        ],
        const SizedBox(height: 18),

        // A published book always carries a file; a draft that reached here by some other
        // route would otherwise open a reader onto a 404.
        if (!book.hasPdf)
          _Panel(child: Text(l.libraryNoFile,
              textAlign: TextAlign.center,
              style: const TextStyle(color: BrandColors.muted, height: 1.8)))
        else if (signedIn)
          BookReader(slug: book.slug, pages: book.pages)
        else
          _Panel(
            child: Column(
              children: [
                Text(l.librarySignInToRead,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: BrandColors.muted, height: 1.9)),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: () => context.push(
                      '/auth?next=${Uri.encodeComponent('/library/${book.slug}')}'),
                  child: Text(l.librarySignIn),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Panel extends StatelessWidget {
  const _Panel({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: BrandColors.surface,
          borderRadius: BorderRadius.circular(14),
        ),
        child: child,
      );
}
