// Home. Assembled from the same endpoints the website uses, with copy read from /settings
// rather than hardcoded, so the admin CMS reaches app users the way it reaches the site.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/theme/tokens.dart';
import '../application/catalogue_providers.dart';
import '../data/catalogue_repository.dart';
import 'widgets/course_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  /// Reads a localised string out of the settings blob, falling back to [fallback] when the
  /// CMS has nothing. The API localises its own content, so no per-language lookup is done
  /// here beyond taking what it sent.
  String _copy(Map<String, dynamic> settings, String key, String fallback) {
    final value = settings[key];
    if (value is String && value.trim().isNotEmpty) return value;
    return fallback;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final settings = ref.watch(settingsProvider);
    final courses = ref.watch(coursesProvider);
    final categories = ref.watch(categoriesProvider);

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(settingsProvider);
          ref.invalidate(categoriesProvider);
          await ref.read(coursesProvider.notifier).refresh();
        },
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Container(
                width: double.infinity,
                decoration: const BoxDecoration(gradient: BrandGradients.hero),
                padding: const EdgeInsets.fromLTRB(22, 56, 22, 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      settings.maybeWhen(
                        data: (s) => _copy(s, 'hero_title', l.appName),
                        orElse: () => l.appName,
                      ),
                      style: const TextStyle(
                          fontSize: 25,
                          fontWeight: FontWeight.w800,
                          color: Colors.white,
                          height: 1.5),
                    ),
                    const SizedBox(height: 10),
                    settings.maybeWhen(
                      data: (s) {
                        final sub = _copy(s, 'hero_subtitle', '');
                        if (sub.isEmpty) return const SizedBox.shrink();
                        return Text(sub,
                            style: TextStyle(
                                fontSize: 14.5,
                                height: 1.8,
                                color: Colors.white.withValues(alpha: 0.85)));
                      },
                      orElse: () => const SizedBox.shrink(),
                    ),
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: () => context.go('/courses'),
                      style: FilledButton.styleFrom(
                        backgroundColor: BrandColors.gold,
                        foregroundColor: BrandColors.ink,
                      ),
                      child: Text(l.coursesTitle),
                    ),
                  ],
                ),
              ),
            ),
            categories.maybeWhen(
              data: (list) => list.isEmpty
                  ? const SliverToBoxAdapter(child: SizedBox.shrink())
                  : SliverToBoxAdapter(
                      child: Padding(
                        padding: const EdgeInsets.only(top: 22),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const _SectionHeading('filterCategory'),
                            SizedBox(
                              height: 44,
                              child: ListView.separated(
                                scrollDirection: Axis.horizontal,
                                padding: const EdgeInsets.symmetric(horizontal: 18),
                                itemCount: list.length,
                                separatorBuilder: (_, _) => const SizedBox(width: 8),
                                itemBuilder: (context, i) {
                                  final c = list[i];
                                  return ActionChip(
                                    label: Text(c.name),
                                    onPressed: () {
                                      ref.read(coursesProvider.notifier).apply(
                                            CourseQuery(category: c.slug),
                                          );
                                      context.go('/courses');
                                    },
                                  );
                                },
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
              orElse: () => const SliverToBoxAdapter(child: SizedBox.shrink()),
            ),
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(18, 24, 18, 40),
              sliver: courses.loading && courses.items.isEmpty
                  ? const SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 40),
                        child: Center(child: CircularProgressIndicator()),
                      ),
                    )
                  : SliverList.builder(
                      // A shelf, not the whole catalogue: the courses tab is one tap away.
                      itemCount: courses.items.length.clamp(0, 6),
                      itemBuilder: (context, i) {
                        final course = courses.items[i];
                        return CourseCard(
                          course: course,
                          onTap: () => context.push('/courses/${course.slug}'),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionHeading extends StatelessWidget {
  const _SectionHeading(this.key_);
  final String key_;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final text = key_ == 'filterCategory' ? l.filterCategory : key_;
    return Padding(
      padding: const EdgeInsetsDirectional.only(start: 20, bottom: 12),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: Text(text,
            style: const TextStyle(
                fontSize: 16, fontWeight: FontWeight.w800, color: BrandColors.ink)),
      ),
    );
  }
}
