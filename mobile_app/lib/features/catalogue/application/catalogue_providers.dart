// Catalogue state. Listings are paged and accumulate, so scrolling does not refetch what is
// already on screen.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/catalogue_dto.dart';
import '../data/catalogue_repository.dart';

final catalogueRepositoryProvider = Provider<CatalogueRepository>(
  (ref) => CatalogueRepository(client: ref.watch(apiClientProvider)),
);

final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(catalogueRepositoryProvider).categories(),
);

final settingsProvider = FutureProvider<Map<String, dynamic>>(
  (ref) => ref.watch(catalogueRepositoryProvider).settings(),
);

final courseDetailProvider = FutureProvider.family<Course, String>(
  (ref, slug) => ref.watch(catalogueRepositoryProvider).course(slug),
);

final videoDetailProvider = FutureProvider.family<Video, int>(
  (ref, id) => ref.watch(catalogueRepositoryProvider).video(id),
);

final instructorsProvider = FutureProvider<List<InstructorRef>>(
  (ref) => ref.watch(catalogueRepositoryProvider).instructors(),
);

final bundlesProvider = FutureProvider<List<Course>>(
  (ref) => ref.watch(catalogueRepositoryProvider).bundles(),
);

final articlesProvider = FutureProvider.family<List<Article>, String?>(
  (ref, kind) => ref.watch(catalogueRepositoryProvider).articles(kind: kind),
);

final pathsProvider = FutureProvider<List<LearningPath>>(
  (ref) => ref.watch(catalogueRepositoryProvider).paths(),
);

final pathProvider = FutureProvider.family<LearningPath, String>(
  (ref, slug) => ref.watch(catalogueRepositoryProvider).path(slug),
);

final articleProvider = FutureProvider.family<Article, String>(
  (ref, slug) => ref.watch(catalogueRepositoryProvider).article(slug),
);

/// A listing that grows as the user pages, rather than replacing itself.
class ListingState<T> {
  const ListingState({
    this.items = const [],
    this.total = 0,
    this.page = 0,
    this.pages = 1,
    this.facets = const {},
    this.loading = false,
    this.loadingMore = false,
    this.error,
  });

  final List<T> items;
  final int total;
  final int page;
  final int pages;

  /// `{dimension: {value: count}}` from the server, each computed with its own dimension
  /// excluded so ticking one level does not zero the other level counts.
  final Map<String, Map<String, int>> facets;
  final bool loading;
  final bool loadingMore;
  final Object? error;

  bool get hasMore => page > 0 && page < pages;

  ListingState<T> copyWith({
    List<T>? items,
    int? total,
    int? page,
    int? pages,
    Map<String, Map<String, int>>? facets,
    bool? loading,
    bool? loadingMore,
    Object? error,
    bool clearError = false,
  }) =>
      ListingState<T>(
        items: items ?? this.items,
        total: total ?? this.total,
        page: page ?? this.page,
        pages: pages ?? this.pages,
        facets: facets ?? this.facets,
        loading: loading ?? this.loading,
        loadingMore: loadingMore ?? this.loadingMore,
        error: clearError ? null : (error ?? this.error),
      );
}

class CoursesController extends Notifier<ListingState<Course>> {
  CourseQuery _query = const CourseQuery();
  CourseQuery get query => _query;

  @override
  ListingState<Course> build() {
    Future.microtask(refresh);
    return const ListingState<Course>(loading: true);
  }

  /// Replaces the filters and reloads from page 1.
  Future<void> apply(CourseQuery query) {
    _query = query.copyWith(page: 1);
    return refresh();
  }

  Future<void> refresh() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final page =
          await ref.read(catalogueRepositoryProvider).courses(_query.copyWith(page: 1));
      _query = _query.copyWith(page: 1);
      state = ListingState<Course>(
        items: page.items,
        total: page.total,
        page: page.page,
        pages: page.pages,
        facets: page.facets,
      );
    } catch (e) {
      state = state.copyWith(loading: false, error: e);
    }
  }

  Future<void> loadMore() async {
    if (!state.hasMore || state.loadingMore || state.loading) return;
    state = state.copyWith(loadingMore: true, clearError: true);
    final next = _query.copyWith(page: state.page + 1);
    try {
      final page = await ref.read(catalogueRepositoryProvider).courses(next);
      _query = next;
      state = state.copyWith(
        items: [...state.items, ...page.items],
        page: page.page,
        pages: page.pages,
        total: page.total,
        loadingMore: false,
      );
    } catch (e) {
      // The pages already loaded stay on screen; only the next-page attempt failed.
      state = state.copyWith(loadingMore: false, error: e);
    }
  }
}

final coursesProvider =
    NotifierProvider<CoursesController, ListingState<Course>>(CoursesController.new);

class VideosController extends Notifier<ListingState<Video>> {
  VideoQuery _query = const VideoQuery();
  VideoQuery get query => _query;

  @override
  ListingState<Video> build() {
    Future.microtask(refresh);
    return const ListingState<Video>(loading: true);
  }

  Future<void> apply(VideoQuery query) {
    _query = query.copyWith(page: 1);
    return refresh();
  }

  Future<void> refresh() async {
    state = state.copyWith(loading: true, clearError: true);
    try {
      final page =
          await ref.read(catalogueRepositoryProvider).videos(_query.copyWith(page: 1));
      _query = _query.copyWith(page: 1);
      state = ListingState<Video>(
        items: page.items,
        total: page.total,
        page: page.page,
        pages: page.pages,
      );
    } catch (e) {
      state = state.copyWith(loading: false, error: e);
    }
  }

  Future<void> loadMore() async {
    if (!state.hasMore || state.loadingMore || state.loading) return;
    state = state.copyWith(loadingMore: true, clearError: true);
    final next = _query.copyWith(page: state.page + 1);
    try {
      final page = await ref.read(catalogueRepositoryProvider).videos(next);
      _query = next;
      state = state.copyWith(
        items: [...state.items, ...page.items],
        page: page.page,
        pages: page.pages,
        total: page.total,
        loadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(loadingMore: false, error: e);
    }
  }
}

final videosProvider =
    NotifierProvider<VideosController, ListingState<Video>>(VideosController.new);
