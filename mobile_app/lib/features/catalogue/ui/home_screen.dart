// Home.
//
// Mirrors the sections of frontend/web/src/pages/Home.jsx, in the same order, driven by
// the same CMS blocks. Two rules run through it:
//
//   1. Every section hides itself when it has nothing. The catalogue is uneven -- there may
//      be videos but no courses, or copy but no testimonials -- and a page wired to one list
//      goes blank the moment that list is empty, which reads as a broken app rather than a
//      young catalogue.
//   2. CMS copy wins, with a translated fallback behind it. The API localises its own text,
//      so nothing here chooses by language.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/domain/session.dart';
import '../../learning/application/learning_providers.dart';
import '../application/catalogue_providers.dart';
import '../data/catalogue_dto.dart';
import '../data/catalogue_repository.dart';
import '../data/site_settings.dart';
import 'widgets/course_card.dart';
import 'widgets/home_sections.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final settingsAsync = ref.watch(settingsProvider);
    final settings = settingsAsync.value ?? const SiteSettings();

    final courses = ref.watch(coursesProvider);
    final videos = ref.watch(videosProvider);
    final categories = ref.watch(categoriesProvider);
    final instructors = ref.watch(instructorsProvider);
    final platformVideos = ref.watch(platformVideosProvider).value ?? const <Video>[];
    final session = ref.watch(sessionProvider);

    // Only asked for when signed in: the endpoint 401s otherwise, and the hero shows the
    // featured-course variant instead.
    final resume = session is SessionSignedIn
        ? ref.watch(learningSummaryProvider).value?.resume
        : null;

    final loading = courses.loading && videos.loading && settingsAsync.isLoading;
    final catalogueEmpty =
        !courses.loading && !videos.loading && courses.items.isEmpty && videos.items.isEmpty;

    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(settingsProvider)
            ..invalidate(categoriesProvider)
            ..invalidate(instructorsProvider)
            ..invalidate(platformVideosProvider)
            ..invalidate(learningSummaryProvider);
          await Future.wait([
            ref.read(coursesProvider.notifier).refresh(),
            ref.read(videosProvider.notifier).refresh(),
          ]);
        },
        child: CustomScrollView(
          slivers: [
            // 1. Hero, with the resume card for a signed-in learner and the featured-course
            //    card otherwise, as on the website.
            SliverToBoxAdapter(
              child: HomeHero(
                hero: settings.hero,
                greeting: session is SessionSignedIn
                    ? l.homeWelcomeBack(session.user.name.trim().split(RegExp(r'\s+')).first)
                    : null,
                resume: resume,
                fallbackTitle: l.homeHeroTitle,
                fallbackSubtitle: l.homeHeroSubtitle,
              ),
            ),

            // 2. Stats band. CMS marketing figures, matching the website.
            if (settings.stats.isNotEmpty)
              SliverToBoxAdapter(child: StatsBand(stats: settings.stats)),

            // 3. Categories.
            categories.maybeWhen(
              data: (list) => list.isEmpty
                  ? const _Nothing()
                  : SliverToBoxAdapter(
                      child: HomeSection(
                        title: settings.home.categoriesTitle.isNotEmpty
                            ? settings.home.categoriesTitle
                            : l.filterCategory,
                        subtitle: settings.home.categoriesSubtitle,
                        child: SizedBox(
                          height: 42,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: list.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 8),
                            itemBuilder: (context, i) => CategoryChip(
                              category: list[i],
                              onTap: () {
                                ref
                                    .read(videosProvider.notifier)
                                    .apply(VideoQuery(category: list[i].slug));
                                ref
                                    .read(coursesProvider.notifier)
                                    .apply(CourseQuery(category: list[i].slug));
                                context.go('/videos');
                              },
                            ),
                          ),
                        ),
                      ),
                    ),
              orElse: () => const _Nothing(),
            ),

            if (loading)
              const SliverToBoxAdapter(child: HomeSkeleton()),

            // Getting started: the platform's own clips, pinned ones first. Sits between
            // categories and the video shelf, where the website has it, and is absent
            // rather than empty when there are none.
            if (platformVideos.isNotEmpty)
              SliverToBoxAdapter(
                child: HomeSection(
                  title: l.homePlatformVideos,
                  subtitle: l.homePlatformVideosSubtitle,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      children: [
                        for (final v in platformVideos)
                          VideoCard(
                            video: v,
                            onTap: () => context.push('/videos/${v.id}'),
                          ),
                      ],
                    ),
                  ),
                ),
              ),

            // 4. Free videos.
            if (videos.items.isNotEmpty)
              SliverToBoxAdapter(
                child: HomeSection(
                  title: settings.home.newTitle.isNotEmpty
                      ? settings.home.newTitle
                      : l.videosTitle,
                  actionLabel: l.seeAll,
                  onAction: () => context.go('/videos'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      children: [
                        for (final v in videos.items.take(4))
                          VideoCard(
                            video: v,
                            onTap: () => context.push('/videos/${v.id}'),
                          ),
                      ],
                    ),
                  ),
                ),
              ),

            // 5. Instructors.
            instructors.when(
              loading: () => const _Nothing(),
              error: (e, _) => SliverToBoxAdapter(
                child: HomeSection(
                  title: l.instructorsTitle,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Text(asApiException(e).code.message(l),
                        style: const TextStyle(
                            fontSize: 13, color: BrandColors.muted2)),
                  ),
                ),
              ),
              data: (list) => list.isEmpty
                  ? const _Nothing()
                  : SliverToBoxAdapter(
                      child: HomeSection(
                        title: settings.home.instructorsTitle.isNotEmpty
                            ? settings.home.instructorsTitle
                            : l.instructorsTitle,
                        subtitle: settings.home.instructorsSubtitle,
                        actionLabel: l.seeAll,
                        onAction: () => context.push('/instructors'),
                        child: SizedBox(
                          height: 138,
                          child: ListView.separated(
                            scrollDirection: Axis.horizontal,
                            padding: const EdgeInsets.symmetric(horizontal: 20),
                            itemCount: list.length,
                            separatorBuilder: (_, _) => const SizedBox(width: 14),
                            itemBuilder: (context, i) => InstructorChip(
                              instructor: list[i],
                              onTap: () =>
                                  context.push('/instructors/${list[i].id}'),
                            ),
                          ),
                        ),
                      ),
                    ),
            ),

            // Courses shelf, for when the catalogue has any.
            if (courses.items.isNotEmpty)
              SliverToBoxAdapter(
                child: HomeSection(
                  title: settings.home.featuredTitle.isNotEmpty
                      ? settings.home.featuredTitle
                      : l.coursesTitle,
                  actionLabel: l.seeAll,
                  onAction: () => context.go('/courses'),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      children: [
                        for (final c in courses.items.take(4))
                          CourseCard(
                            course: c,
                            onTap: () => context.push('/courses/${c.slug}'),
                          ),
                      ],
                    ),
                  ),
                ),
              ),

            // 6. Testimonials.
            if (settings.testimonials.any((t) => !t.isEmpty))
              SliverToBoxAdapter(
                child: HomeSection(
                  title: settings.home.testimonialsTitle.isNotEmpty
                      ? settings.home.testimonialsTitle
                      : l.homeTestimonialsFallback,
                  child: TestimonialList(
                    testimonials:
                        settings.testimonials.where((t) => !t.isEmpty).toList(),
                  ),
                ),
              ),

            // 7. B2B banner.
            if (!settings.business.isEmpty)
              SliverToBoxAdapter(
                child: BusinessBanner(
                  business: settings.business,
                  onTap: () => context.push('/business'),
                ),
              ),

            // Nothing published at all is a real state, not a failure. Say so.
            if (catalogueEmpty)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(32, 44, 32, 12),
                  child: Column(children: [
                    Image.asset('assets/brand/icon.png',
                        height: 44, opacity: const AlwaysStoppedAnimation(0.35)),
                    const SizedBox(height: 16),
                    Text(l.homeCatalogueEmpty,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            fontSize: 14, height: 1.9, color: BrandColors.muted)),
                  ]),
                ),
              ),

            // 8. Final call to action.
            SliverToBoxAdapter(
              child: FinalCta(
                title: settings.home.ctaTitle,
                subtitle: settings.home.ctaSubtitle,
                fallbackTitle: l.homeHeroTitle,
                buttonLabel: session is SessionSignedIn ? l.coursesTitle : l.authSignUp,
                onTap: () => context.go(
                    session is SessionSignedIn ? '/courses' : '/auth'),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
    );
  }
}

/// Renders nothing, as a sliver, so it can sit in the slivers list.
class _Nothing extends StatelessWidget {
  const _Nothing();

  @override
  Widget build(BuildContext context) =>
      const SliverToBoxAdapter(child: SizedBox.shrink());
}
