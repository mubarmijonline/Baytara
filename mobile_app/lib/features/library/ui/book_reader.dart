// The read-only reader for a book summary.
//
// What it is, stated plainly, because the difference matters when someone asks whether the
// library is "protected":
//
//   The player has DRM. This does not. There is no DRM for a PDF, and pretending otherwise
//   in a comment is how a false promise reaches a client. What this screen does is remove
//   every affordance for keeping a copy -- no download, no share, no print, no text to
//   select, no system viewer -- and turn on the same window-level capture guard the player
//   uses. Someone who can read a page can still photograph it with a second phone. The
//   content is Baytara's own summary of a published work, and the point of the section is
//   that people come back here to read it, so that trade is the right one.
//
// Three deliberate choices:
//
//   - The pages are rendered as images (pdfx draws each page through the platform's own
//     PDF renderer), not shown in a system viewer. `flutter_pdfview` and an in-app browser
//     both hand the user a viewer with a share button and a save button that cannot be
//     removed.
//   - The bytes are fetched with the bearer token and held in memory. Nothing writes them
//     to storage the user can reach. On Android, pdfx's `openData` does copy the bytes to
//     the app's private cache directory so the platform renderer can take a file
//     descriptor -- app-private, invisible to a file manager, cleared by the OS -- which
//     is worth knowing rather than being surprised by.
//   - The capture guard is turned on for this route only, exactly as the player does it.
//     Blocking screenshots app-wide would stop someone sending a colleague a course
//     description, which costs goodwill and protects nothing. The guard's method channel
//     holds one handler, so this screen and the player must never be alive at once -- no
//     route leads from one to the other, and none should be added without giving the guard
//     a reference count first.
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdfx/pdfx.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';
import '../../player/application/playback_guard.dart';
import '../application/library_providers.dart';

class BookReader extends ConsumerStatefulWidget {
  const BookReader({super.key, required this.slug, this.pages});

  final String slug;

  /// The page count the listing already knew, so the indicator can show "1 / 40" before
  /// the document has finished opening.
  final int? pages;

  @override
  ConsumerState<BookReader> createState() => _BookReaderState();
}

class _BookReaderState extends ConsumerState<BookReader> {
  final PlaybackGuard _guard = PlaybackGuard();

  PdfController? _controller;
  int _page = 1;
  int? _total;
  String? _error;

  /// True while the OS says a recording or a mirror is running. iOS only in practice:
  /// on Android FLAG_SECURE has already blanked the frame before this could matter.
  bool _covered = false;

  @override
  void initState() {
    super.initState();
    _guard.onCaptureChanged = (signal) {
      if (mounted) setState(() => _covered = signal.captured);
    };
    _guard.enable();
    _open();
  }

  @override
  void dispose() {
    _guard.disable();
    // Closing drops the native document and, on Android, the file descriptor into the
    // cached copy. Disposing the controller alone would leave both open.
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _open() async {
    try {
      final bytes = await ref
          .read(libraryRepositoryProvider)
          .summaryPdf(widget.slug);
      if (bytes.isEmpty) throw const ApiException(code: ApiErrorCode.server, statusCode: null);
      final resume = await ref.read(secureStoreProvider).bookPage(widget.slug);
      if (!mounted) return;
      setState(() {
        _page = resume ?? 1;
        _controller = PdfController(
          document: PdfDocument.openData(Uint8List.fromList(bytes)),
          initialPage: _page,
        );
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.code.message(L10n.of(context)));
    }
  }

  void _onPageChanged(int page) {
    setState(() => _page = page);
    // Fire and forget: losing the place is not worth an error in front of a reader.
    ref.read(secureStoreProvider).setBookPage(widget.slug, page);
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final controller = _controller;

    if (_error != null) {
      return _Panel(
        child: Text(_error!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: BrandColors.muted, height: 1.8)),
      );
    }
    if (controller == null) {
      return const _Panel(child: Center(child: CircularProgressIndicator()));
    }

    final total = _total ?? widget.pages;

    return Column(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(14),
          child: Container(
            color: BrandColors.surface,
            height: 560,
            child: _covered
                // Nothing is drawn while a capture is running, and the reader is told why
                // rather than left looking at a blank rectangle.
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(28),
                      child: Text(l.readerCaptureBlocked,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              color: BrandColors.muted, height: 1.8, fontSize: 14)),
                    ),
                  )
                : PdfView(
                    controller: controller,
                    onPageChanged: _onPageChanged,
                    onDocumentLoaded: (doc) =>
                        setState(() => _total = doc.pagesCount),
                    // A summary in Arabic turns the way an Arabic book turns. The page
                    // order in the file is unchanged; only the swipe direction follows the
                    // text direction, which is what `reverse` does.
                    reverse: Directionality.of(context) == TextDirection.rtl,
                    backgroundDecoration:
                        const BoxDecoration(color: BrandColors.surfaceAlt),
                    builders: PdfViewBuilders<DefaultBuilderOptions>(
                      options: const DefaultBuilderOptions(),
                      documentLoaderBuilder: (_) =>
                          const Center(child: CircularProgressIndicator()),
                      pageLoaderBuilder: (_) =>
                          const Center(child: CircularProgressIndicator()),
                      errorBuilder: (_, _) => Center(
                        child: Padding(
                          padding: const EdgeInsets.all(28),
                          child: Text(l.readerFailed,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: BrandColors.muted, height: 1.8)),
                        ),
                      ),
                    ),
                  ),
          ),
        ),
        const SizedBox(height: 10),
        Text(
          total == null ? '$_page' : l.readerPageOf(_page, total),
          style: const TextStyle(fontSize: 13, color: BrandColors.muted2),
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
        height: 220,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: BrandColors.surface,
          borderRadius: BorderRadius.circular(14),
        ),
        child: child,
      );
}
