// Library state. Two reads and a fetch -- nothing here accumulates or pages, because the
// shelf is small and the server returns it whole.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/library_dto.dart';
import '../data/library_repository.dart';

final libraryRepositoryProvider = Provider<LibraryRepository>(
  (ref) => LibraryRepository(client: ref.watch(apiClientProvider)),
);

final booksProvider = FutureProvider<List<Book>>(
  (ref) => ref.watch(libraryRepositoryProvider).books(),
);

final bookProvider = FutureProvider.family<Book, String>(
  (ref, slug) => ref.watch(libraryRepositoryProvider).book(slug),
);
