// The video library: search, category chips, and paging. The filter set is smaller than the
// courses one because the server offers fewer: no rating or level, and the sorts differ
// (newest/oldest/longest/shortest, with no `popular`).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../application/catalogue_providers.dart';
import 'widgets/course_card.dart';
import '../../../core/theme/branded_title.dart';

class VideosScreen extends ConsumerStatefulWidget {
  const VideosScreen({super.key});

  @override
  ConsumerState<VideosScreen> createState() => _VideosScreenState();
}

class _VideosScreenState extends ConsumerState<VideosScreen> {
  final _scroll = ScrollController();
  final _search = TextEditingController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels >= _scroll.position.maxScrollExtent - 600) {
        ref.read(videosProvider.notifier).loadMore();
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
    final state = ref.watch(videosProvider);
    final controller = ref.read(videosProvider.notifier);
    final categories = ref.watch(categoriesProvider);

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(l.videosTitle)),
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
            categories.maybeWhen(
              data: (list) => SizedBox(
                height: 42,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: list.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final c = list[i];
                    final selected = controller.query.category == c.slug;
                    return _CategoryChip(
                      // The count is the number of published videos in that category,
                      // so a chip never leads to an empty shelf without warning.
                      label: c.videoCount > 0 ? '${c.name} (${c.videoCount})' : c.name,
                      selected: selected,
                      onTap: () => controller.apply(
                        selected
                            ? controller.query.copyWith(clearCategory: true)
                            : controller.query.copyWith(category: c.slug),
                      ),
                    );
                  },
                ),
              ),
              orElse: () => const SizedBox.shrink(),
            ),
            const SizedBox(height: 8),
            Expanded(
              child: switch (state) {
                _ when state.loading && state.items.isEmpty =>
                  const Center(child: CircularProgressIndicator()),
                _ when state.error != null && state.items.isEmpty => Center(
                    child: Padding(
                      padding: const EdgeInsets.all(32),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(asApiException(state.error!).code.message(l),
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                                color: BrandColors.muted, height: 1.7)),
                        const SizedBox(height: 16),
                        OutlinedButton(
                            onPressed: controller.refresh,
                            child: Text(l.commonRetry)),
                      ]),
                    ),
                  ),
                _ when state.items.isEmpty => ListView(children: [
                    Padding(
                      padding: const EdgeInsets.all(40),
                      child: Center(
                        child: Text(l.noResults,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: BrandColors.muted2)),
                      ),
                    ),
                  ]),
                _ => ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                    itemCount: state.items.length + (state.hasMore ? 1 : 0),
                    itemBuilder: (context, i) {
                      if (i >= state.items.length) {
                        return const Padding(
                          padding: EdgeInsets.symmetric(vertical: 24),
                          child: Center(child: CircularProgressIndicator()),
                        );
                      }
                      final v = state.items[i];
                      return VideoCard(
                        video: v,
                        onTap: () => context.push('/videos/${v.id}'),
                      );
                    },
                  ),
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Semantics(
        selected: selected,
        button: true,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(20),
          child: Container(
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            decoration: BoxDecoration(
              color: selected ? BrandColors.accent : BrandColors.surfaceMuted,
              border: Border.all(
                  color: selected ? BrandColors.accent : BrandColors.line),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                color: selected ? Colors.white : BrandColors.ink2,
              ),
            ),
          ),
        ),
      );
}
