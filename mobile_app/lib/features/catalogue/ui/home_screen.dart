// Home.
//
// Built from several shelves rather than one, because the catalogue is uneven: there may be
// videos but no courses, or instructors but neither. A home page wired to a single list goes
// blank the moment that list is empty, which reads as a broken app rather than a young
// catalogue. Every shelf here hides itself when it has nothing, and the page says something
// useful when they are all empty.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/domain/session.dart';
import '../application/catalogue_providers.dart';
import '../data/catalogue_dto.dart';
import '../data/catalogue_repository.dart';
import 'widgets/course_card.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  /// A localised string from the settings CMS, falling back when it is not set. The API
  /// localises its own content, so nothing is chosen by language here.
  String _copy(Map<String, dynamic> settings, String key, String fallback) {
    final value = settings[key];
    return (value is String && value.trim().isNotEmpty) ? value : fallback;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final settings = ref.watch(settingsProvider);
    final courses = ref.watch(coursesProvider);
    final videos = ref.watch(videosProvider);
    final categories = ref.watch(categoriesProvider);
    final instructors = ref.watch(instructorsProvider);
    final session = ref.watch(sessionProvider);

    final courseList = courses.items;
    final videoList = videos.items;
    final stillLoading = courses.loading || videos.loading;
    final everythingEmpty =
        !stillLoading && courseList.isEmpty && videoList.isEmpty;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(settingsProvider)
            ..invalidate(categoriesProvider)
            ..invalidate(instructorsProvider);
          await Future.wait([
            ref.read(coursesProvider.notifier).refresh(),
            ref.read(videosProvider.notifier).refresh(),
          ]);
        },
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: _Hero(
                title: settings.maybeWhen(
                  data: (s) => _copy(s, 'hero_title', l.homeHeroTitle),
                  orElse: () => l.homeHeroTitle,
                ),
                subtitle: settings.maybeWhen(
                  data: (s) => _copy(s, 'hero_subtitle', l.homeHeroSubtitle),
                  orElse: () => l.homeHeroSubtitle,
                ),
                greeting: session is SessionSignedIn
                    ? l.homeWelcomeBack(session.user.name.split(' ').first)
                    : null,
              ),
            ),

            // Categories are the one thing that is reliably populated, so they lead.
            categories.maybeWhen(
              data: (list) => list.isEmpty
                  ? const _NoSliver()
                  : SliverToBoxAdapter(
                      child: _Shelf(
                        title: l.filterCategory,
                        child: SizedBox(
                          height: 40,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 18),
                            itemCount: list.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 8),
                            itemBuilder: (context, i) => _CategoryChip(
                              category: list[i],
                              onTap: () {
                                ref
                                    .read(coursesProvider.notifier)
                                    .apply(CourseQuery(category: list[i].slug));
                                ref
                                    .read(videosProvider.notifier)
                                    .apply(VideoQuery(category: list[i].slug));
                                context.go('/videos');
                              },
                            ),
                          ),
                        ),
                      ),
                    ),
              orElse: () => const _NoSliver(),
            ),

            if (stillLoading && courseList.isEmpty && videoList.isEmpty)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: 60),
                  child: Center(child: CircularProgressIndicator()),
                ),
              ),

            // Videos before courses: right now the catalogue has videos and no courses, and
            // a shelf that is empty simply does not render.
            if (videoList.isNotEmpty)
              SliverToBoxAdapter(
                child: _Shelf(
                  title: l.videosTitle,
                  actionLabel: l.seeAll,
                  onAction: () => context.go('/videos'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    child: Column(
                      children: [
                        for (final v in videoList.take(4))
                          VideoCard(
                            video: v,
                            onTap: () => context.push('/videos/${v.id}'),
                          ),
                      ],
                    ),
                  ),
                ),
              ),

            if (courseList.isNotEmpty)
              SliverToBoxAdapter(
                child: _Shelf(
                  title: l.coursesTitle,
                  actionLabel: l.seeAll,
                  onAction: () => context.go('/courses'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 18),
                    child: Column(
                      children: [
                        for (final c in courseList.take(4))
                          CourseCard(
                            course: c,
                            onTap: () => context.push('/courses/${c.slug}'),
                          ),
                      ],
                    ),
                  ),
                ),
              ),

            instructors.maybeWhen(
              data: (list) => list.isEmpty
                  ? const _NoSliver()
                  : SliverToBoxAdapter(
                      child: _Shelf(
                        title: l.instructorsTitle,
                        child: SizedBox(
                          height: 132,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 18),
                            itemCount: list.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 12),
                            itemBuilder: (context, i) => GestureDetector(
                              onTap: () =>
                                  context.push('/instructors/${list[i].id}'),
                              child: _InstructorChip(instructor: list[i]),
                            ),
                          ),
                        ),
                      ),
                    ),
              orElse: () => const _NoSliver(),
            ),

            // Everything empty is a real state right now: the catalogue has no published
            // courses. Say so plainly instead of showing a blank screen that reads as a bug.
            if (everythingEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(32, 50, 32, 50),
                  child: Column(
                    children: [
                      const Icon(Icons.inventory_2_outlined,
                          size: 40, color: BrandColors.muted2),
                      const SizedBox(height: 16),
                      Text(
                        l.homeCatalogueEmpty,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 14, height: 1.9, color: BrandColors.muted),
                      ),
                    ],
                  ),
                ),
              ),

            const SliverToBoxAdapter(child: SizedBox(height: 28)),
          ],
        ),
      ),
    );
  }
}

/// Renders nothing, but as a sliver so it can sit in the CustomScrollView list.
class _NoSliver extends StatelessWidget {
  const _NoSliver();

  @override
  Widget build(BuildContext context) =>
      const SliverToBoxAdapter(child: SizedBox.shrink());
}

class _Hero extends StatelessWidget {
  const _Hero({required this.title, required this.subtitle, this.greeting});

  final String title;
  final String subtitle;
  final String? greeting;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(gradient: BrandGradients.hero),
      padding: const EdgeInsets.fromLTRB(22, 60, 22, 34),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (greeting != null) ...[
            Text(greeting!,
                style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: BrandColors.gold.withValues(alpha: 0.95))),
            const SizedBox(height: 8),
          ],
          Text(title,
              style: const TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  height: 1.45)),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(subtitle,
                style: TextStyle(
                    fontSize: 14,
                    height: 1.85,
                    color: Colors.white.withValues(alpha: 0.82))),
          ],
          const SizedBox(height: 22),
          Row(children: [
            FilledButton(
              onPressed: () => context.go('/courses'),
              style: FilledButton.styleFrom(
                backgroundColor: BrandColors.gold,
                foregroundColor: BrandColors.ink,
              ),
              child: Text(l.coursesTitle),
            ),
            const SizedBox(width: 10),
            OutlinedButton(
              onPressed: () => context.go('/videos'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: BorderSide(color: Colors.white.withValues(alpha: 0.5)),
              ),
              child: Text(l.videosTitle),
            ),
          ]),
        ],
      ),
    );
  }
}

/// A titled section with an optional "see all". Renders its own spacing so the slivers above
/// do not each have to remember it.
class _Shelf extends StatelessWidget {
  const _Shelf({
    required this.title,
    required this.child,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final Widget child;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 26),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 20, end: 8, bottom: 12),
              child: Row(children: [
                Expanded(
                  child: Text(title,
                      style: const TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: BrandColors.ink)),
                ),
                if (actionLabel != null && onAction != null)
                  TextButton(onPressed: onAction, child: Text(actionLabel!)),
              ]),
            ),
            child,
          ],
        ),
      );
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.category, required this.onTap});

  final Category category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: BrandColors.surfaceMuted,
            border: Border.all(color: BrandColors.line),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(category.name,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: BrandColors.ink2)),
            // The count is how many published videos sit behind the chip, so an empty
            // category is visible before it is tapped.
            if (category.videoCount > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: BrandColors.accentSoft,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text('${category.videoCount}',
                    style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: BrandColors.accent)),
              ),
            ],
          ]),
        ),
      );
}

class _InstructorChip extends StatelessWidget {
  const _InstructorChip({required this.instructor});
  final InstructorRef instructor;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: 96,
        child: Column(
          children: [
            CircleAvatar(
              radius: 34,
              backgroundColor: BrandColors.accentSoft,
              backgroundImage: (instructor.avatarUrl?.isNotEmpty ?? false)
                  ? NetworkImage(instructor.avatarUrl!)
                  : null,
              child: (instructor.avatarUrl?.isEmpty ?? true)
                  ? const Icon(Icons.person, color: BrandColors.accent, size: 30)
                  : null,
            ),
            const SizedBox(height: 8),
            Text(instructor.name,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600, height: 1.4)),
          ],
        ),
      );
}
