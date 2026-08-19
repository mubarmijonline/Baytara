// The courses list: search, the full filter set, facet counts, and paging.
//
// Facet counts come from the server, which computes each dimension with its own filter
// excluded. That is why ticking one level does not zero the other level counts, and why
// the numbers here are read rather than derived from the loaded page.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/access/access.dart';
import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../application/catalogue_providers.dart';
import '../data/catalogue_repository.dart';
import 'widgets/access_badge.dart';
import 'widgets/course_card.dart';

class CoursesScreen extends ConsumerStatefulWidget {
  const CoursesScreen({super.key});

  @override
  ConsumerState<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends ConsumerState<CoursesScreen> {
  final _scroll = ScrollController();
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      // Paging starts before the user hits the end, so the next page is usually already
      // there by the time they arrive.
      if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 600) {
        ref.read(coursesProvider.notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final state = ref.watch(coursesProvider);
    final controller = ref.read(coursesProvider.notifier);

    return Scaffold(
      appBar: AppBar(
        title: Text(l.coursesTitle),
        actions: [
          IconButton(
            tooltip: l.filters,
            icon: const Icon(Icons.tune),
            onPressed: () => _openFilters(context),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                onSubmitted: (v) =>
                    controller.apply(controller.query.copyWith(search: v)),
                decoration: InputDecoration(
                  hintText: l.searchHint,
                  prefixIcon: const Icon(Icons.search, size: 20),
                  isDense: true,
                ),
              ),
            ),
            if (!state.loading && state.items.isNotEmpty)
              Padding(
                padding: const EdgeInsetsDirectional.only(start: 18, bottom: 6),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(l.resultsCount(state.total),
                      style: const TextStyle(
                          fontSize: 12.5, color: BrandColors.muted2)),
                ),
              ),
            Expanded(child: _body(state, controller, l)),
          ],
        ),
      ),
    );
  }

  Widget _body(ListingState state, CoursesController controller, L10n l) {
    if (state.loading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (state.error != null && state.items.isEmpty) {
      return _ErrorView(
        message: asApiException(state.error!).code.message(l),
        onRetry: controller.refresh,
        retryLabel: l.commonRetry,
      );
    }
    if (state.items.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(40),
            child: Center(
              child: Text(l.noResults,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: BrandColors.muted2)),
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 24),
      itemCount: state.items.length + (state.hasMore ? 1 : 0),
      itemBuilder: (context, i) {
        if (i >= state.items.length) {
          return const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Center(child: CircularProgressIndicator()),
          );
        }
        final course = state.items[i];
        return CourseCard(
          course: course,
          onTap: () => context.push('/courses/${course.slug}'),
        );
      },
    );
  }

  Future<void> _openFilters(BuildContext context) async {
    final controller = ref.read(coursesProvider.notifier);
    final applied = await showModalBottomSheet<CourseQuery>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _FilterSheet(
        query: controller.query,
        facets: ref.read(coursesProvider).facets,
      ),
    );
    if (applied != null) await controller.apply(applied);
  }
}

class _FilterSheet extends ConsumerStatefulWidget {
  const _FilterSheet({required this.query, required this.facets});

  final CourseQuery query;
  final Map<String, Map<String, int>> facets;

  @override
  ConsumerState<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<_FilterSheet> {
  late CourseQuery _draft = widget.query;

  static const _levels = ['beginner', 'intermediate', 'advanced'];
  static const _durations = ['short', 'medium', 'long'];
  static const _sorts = [
    'newest',
    'oldest',
    'popular',
    'rating',
    'price_asc',
    'price_desc',
  ];

  String _levelLabel(String v, L10n l) => switch (v) {
        'beginner' => l.levelBeginner,
        'intermediate' => l.levelIntermediate,
        _ => l.levelAdvanced,
      };

  String _durationLabel(String v, L10n l) => switch (v) {
        'short' => l.durationShort,
        'medium' => l.durationMedium,
        _ => l.durationLong,
      };

  String _sortLabel(String v, L10n l) => switch (v) {
        'newest' => l.sortNewest,
        'oldest' => l.sortOldest,
        'popular' => l.sortPopular,
        'rating' => l.sortRating,
        'price_asc' => l.sortPriceAsc,
        _ => l.sortPriceDesc,
      };

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final categories = ref.watch(categoriesProvider);
    final levelCounts = widget.facets['level'] ?? const {};
    final accessCounts = widget.facets['access_type'] ?? const {};

    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.75,
      maxChildSize: 0.95,
      builder: (context, scroll) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 12, 8),
            child: Row(children: [
              Text(l.filters,
                  style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
              const Spacer(),
              TextButton(
                onPressed: () => setState(() => _draft = CourseQuery(sort: _draft.sort)),
                child: Text(l.filtersClear),
              ),
            ]),
          ),
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              children: [
                categories.maybeWhen(
                  data: (list) => _Section(
                    title: l.filterCategory,
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final c in list)
                          _Choice(
                            label: c.name,
                            selected: _draft.category == c.slug,
                            onTap: () => setState(() => _draft = _draft.category == c.slug
                                ? _draft.copyWith(clearCategory: true)
                                : _draft.copyWith(category: c.slug)),
                          ),
                      ],
                    ),
                  ),
                  orElse: () => const SizedBox.shrink(),
                ),
                _Section(
                  title: l.filterLevel,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final v in _levels)
                        _Choice(
                          label: _levelLabel(v, l),
                          count: levelCounts[v],
                          selected: _draft.level == v,
                          onTap: () => setState(() => _draft = _draft.level == v
                              ? _draft.copyWith(clearLevel: true)
                              : _draft.copyWith(level: v)),
                        ),
                    ],
                  ),
                ),
                _Section(
                  title: l.filterAccess,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final tier in AccessTier.values)
                        _Choice(
                          label: tierLabel(tier, l),
                          count: accessCounts[tier.wire],
                          selected: _draft.accessType == tier.wire,
                          onTap: () => setState(() => _draft = _draft.accessType == tier.wire
                              ? _draft.copyWith(clearAccessType: true)
                              : _draft.copyWith(accessType: tier.wire)),
                        ),
                    ],
                  ),
                ),
                _Section(
                  title: l.filterDuration,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final v in _durations)
                        _Choice(
                          label: _durationLabel(v, l),
                          selected: _draft.duration == v,
                          onTap: () => setState(() => _draft = _draft.duration == v
                              ? _draft.copyWith(clearDuration: true)
                              : _draft.copyWith(duration: v)),
                        ),
                    ],
                  ),
                ),
                _Section(
                  title: l.filterRating,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final v in [3.0, 4.0, 4.5])
                        _Choice(
                          label: '${v.toStringAsFixed(v == 4.5 ? 1 : 0)}+',
                          selected: _draft.minRating == v,
                          onTap: () => setState(() => _draft = _draft.minRating == v
                              ? _draft.copyWith(clearMinRating: true)
                              : _draft.copyWith(minRating: v)),
                        ),
                    ],
                  ),
                ),
                _Section(
                  title: l.filterSort,
                  child: Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final v in _sorts)
                        _Choice(
                          label: _sortLabel(v, l),
                          selected: _draft.sort == v,
                          onTap: () => setState(() => _draft = _draft.copyWith(sort: v)),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
              child: SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).pop(_draft),
                  child: Text(l.filtersApply),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 13.5, fontWeight: FontWeight.w800, color: BrandColors.ink)),
            const SizedBox(height: 10),
            child,
          ],
        ),
      );
}

class _Choice extends StatelessWidget {
  const _Choice({
    required this.label,
    required this.selected,
    required this.onTap,
    this.count,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  /// The server's facet count. Null means this dimension has no counts (category,
  /// duration and rating are not facetted), so nothing is shown rather than a zero.
  final int? count;

  @override
  Widget build(BuildContext context) {
    // A count of zero is worth showing rather than hiding: it tells the user the
    // combination is empty *before* they apply it.
    final text = count == null ? label : '$label ($count)';
    return Semantics(
      selected: selected,
      button: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          constraints: const BoxConstraints(minHeight: 38),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: selected ? BrandColors.accentSoft : BrandColors.surfaceMuted,
            border: Border.all(
                color: selected ? BrandColors.accent : BrandColors.line,
                width: selected ? 1.5 : 1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (selected) ...[
                const Icon(Icons.check, size: 14, color: BrandColors.accent),
                const SizedBox(width: 5),
              ],
              Text(
                text,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? BrandColors.accent : BrandColors.ink2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({
    required this.message,
    required this.onRetry,
    required this.retryLabel,
  });

  final String message;
  final VoidCallback onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: BrandColors.muted, height: 1.7)),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: Text(retryLabel)),
            ],
          ),
        ),
      );
}
