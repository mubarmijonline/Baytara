// The library screens, pumped.
//
// Not hardware, and not the reader: opening a document needs a platform channel these
// tests do not have. What is checked here is everything around it -- that the shelf
// switches, that a visitor is asked to sign in rather than shown an empty frame, and that
// a book with no file never offers a reader that would 404.
import 'package:baytara/core/i18n/app_localizations.dart';
import 'package:baytara/features/auth/domain/session.dart';
import 'package:baytara/features/catalogue/application/catalogue_providers.dart';
import 'package:baytara/features/catalogue/data/catalogue_dto.dart';
import 'package:baytara/features/library/application/library_providers.dart';
import 'package:baytara/features/library/data/library_dto.dart';
import 'package:baytara/features/library/ui/book_detail_screen.dart';
import 'package:baytara/features/library/ui/library_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

const _book = Book(
  slug: 'merck',
  title: 'ملخص دليل ميرك',
  bookAuthor: 'Merck & Co.',
  excerpt: 'ملخص عربي.',
  pages: 48,
  hasPdf: true,
);

class _SignedOut extends SessionController {
  @override
  SessionState build() => const SessionSignedOut();
}

class _SignedIn extends SessionController {
  @override
  SessionState build() => const SessionSignedIn(
        AuthUser(id: 1, name: 'د. أحمد', email: 'a@b.c', phone: '+201000000000'),
      );
}

// `Override` is not exported from flutter_riverpod's public API, so the scope is built at
// each call site and only the MaterialApp wrapper is shared.
Widget _app(Widget child) => MaterialApp(
      locale: const Locale('ar'),
      localizationsDelegates: L10n.localizationsDelegates,
      supportedLocales: L10n.supportedLocales,
      home: child,
    );

void main() {
  testWidgets('the shelf switches from articles to books', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        booksProvider.overrideWith((ref) async => [_book]),
        articlesProvider.overrideWith(
          (ref, kind) async => [const Article(slug: 'a', title: 'مقال')],
        ),
      ],
      child: _app(const LibraryScreen()),
    ));
    await tester.pumpAndSettle();

    expect(find.text('مقال'), findsOneWidget);
    expect(find.text(_book.title), findsNothing);

    await tester.tap(find.text('الكتب'));
    await tester.pumpAndSettle();

    expect(find.text(_book.title), findsOneWidget);
    expect(find.textContaining('48'), findsOneWidget,
        reason: 'the page count the server read out of the file');
  });

  testWidgets('a visitor is offered a sign-in, not a reader', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        sessionProvider.overrideWith(_SignedOut.new),
        bookProvider.overrideWith((ref, slug) async => _book),
      ],
      child: _app(const BookDetailScreen(slug: 'merck')),
    ));
    await tester.pumpAndSettle();

    final l = await L10n.delegate.load(const Locale('ar'));
    expect(find.text(l.librarySignInToRead), findsOneWidget);
    expect(find.text(l.librarySignIn), findsOneWidget);
  });

  testWidgets('a book with no file says so instead of opening a reader', (tester) async {
    await tester.pumpWidget(ProviderScope(
      overrides: [
        sessionProvider.overrideWith(_SignedIn.new),
        bookProvider.overrideWith(
          (ref, slug) async => const Book(slug: 'merck', title: 't', hasPdf: false),
        ),
      ],
      child: _app(const BookDetailScreen(slug: 'merck')),
    ));
    await tester.pumpAndSettle();

    final l = await L10n.delegate.load(const Locale('ar'));
    expect(find.text(l.libraryNoFile), findsOneWidget);
  });
}
