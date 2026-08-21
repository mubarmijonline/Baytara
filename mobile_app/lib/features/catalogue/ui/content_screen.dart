// The free-content shelf, and the blog.
//
// Articles are one table on the server distinguished by `type` (ARTICLE_TYPES = blog |
// content). The website's /content page fetches only `articles('content')`, and this screen
// matched that exactly -- which left it empty, because no articles are published.
//
// The free tab now also lists **free videos**, which the page's own subtitle has always
// promised ("ندوات، ملفات، وسلاسل فيديو مجانية"). They exist in the library and were
// reachable only from the Videos tab, so a visitor following the site's own description
// found nothing. The blog tab stays articles-only, since a video is not a blog post.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/access/access.dart';
import '../../auth/domain/session.dart';
import '../../learning/application/learning_providers.dart';
// `Enrollment` here is the learning model, not anything in the catalogue.
import '../../learning/data/learning_dto.dart';
import '../application/catalogue_providers.dart';
import '../data/catalogue_dto.dart';
import 'widgets/course_card.dart';
import '../../../core/theme/branded_title.dart';

class ContentScreen extends ConsumerWidget {
  const ContentScreen({super.key, this.kind = 'content'});

  /// `content` for the free advisory shelf, `blog` for posts.
  final String kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(articlesProvider(kind));

    // Free videos belong on the free-content shelf, not only in the library. The blog is
    // articles only.
    final freeVideos = kind == 'blog'
        ? const <Video>[]
        : ref
            .watch(videosProvider)
            .items
            .where((v) => v.tier == AccessTier.free && v.hasVideo)
            .toList();

    // Courses the user is enrolled in get their own section at the top: this is the shelf
    // they came here for, and burying it under general free content would be wrong.
    // Signed-out visitors never ask, since /enrollments 401s for them.
    final enrolled = kind == 'blog' || ref.watch(sessionProvider) is! SessionSignedIn
        ? const <Enrollment>[]
        : (ref.watch(enrollmentsProvider).value ?? const <Enrollment>[]);

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(kind == 'blog' ? l.blogTitle : l.tabContent)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(articlesProvider(kind)),
        child: async.when(
          loading: () => freeVideos.isEmpty
              ? const Center(child: CircularProgressIndicator())
              : _list(context, const [], freeVideos, enrolled, l),
          error: (e, _) => ListView(children: [
            Padding(
              padding: const EdgeInsets.all(32),
              child: Text(asApiException(e).code.message(l),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: BrandColors.muted, height: 1.7)),
            ),
          ]),
          data: (rows) => rows.isEmpty && freeVideos.isEmpty && enrolled.isEmpty
              ? ListView(children: [
                  Padding(
                    padding: const EdgeInsets.all(40),
                    child: Center(
                      child: Text(
                        kind == 'blog' ? l.blogEmpty : l.contentEmpty,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: BrandColors.muted2, height: 1.8),
                      ),
                    ),
                  ),
                ])
              : _list(context, rows, freeVideos, enrolled, l),
        ),
      ),
    );
  }
}

/// Free videos first, then articles. Headings appear only when both kinds are present, so
/// a single-kind shelf is not cluttered with a label that explains nothing.
Widget _list(
  BuildContext context,
  List<Article> articles,
  List<Video> videos,
  List<Enrollment> enrolled,
  L10n l,
) {
  // Headings only earn their place once more than one kind is on screen; a single-kind
  // shelf labelled with its own name explains nothing.
  final kinds =
      [enrolled.isNotEmpty, videos.isNotEmpty, articles.isNotEmpty].where((x) => x).length;
  final showHeadings = kinds > 1;

  return ListView(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
    children: [
      if (enrolled.isNotEmpty) ...[
        if (showHeadings) _Heading(l.myCourses),
        for (final e in enrolled)
          if (e.course != null)
            CourseCard(
              course: e.course!,
              // Suppresses the price and the buy prompt: this seat is already bought.
              entitled: true,
              onTap: () => context.push('/courses/${e.course!.slug}'),
            ),
      ],
      if (videos.isNotEmpty) ...[
        if (showHeadings) _Heading(l.videosTitle),
        for (final v in videos)
          VideoCard(video: v, onTap: () => context.push('/videos/${v.id}')),
      ],
      if (articles.isNotEmpty) ...[
        if (showHeadings) _Heading(l.blogTitle),
        for (final a in articles) _ArticleCard(article: a),
      ],
    ],
  );
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10, top: 4),
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: Text(text,
              style: const TextStyle(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w800,
                  color: BrandColors.ink)),
        ),
      );
}

class _ArticleCard extends StatelessWidget {
  const _ArticleCard({required this.article});
  final Article article;

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/articles/${article.slug}'),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(article.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700, height: 1.5)),
                if (article.excerpt?.trim().isNotEmpty ?? false) ...[
                  const SizedBox(height: 6),
                  Text(article.excerpt!,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 13, height: 1.7, color: BrandColors.muted)),
                ],
              ],
            ),
          ),
        ),
      );
}

/// One article. The body is plain text from the CMS, not HTML, so it is rendered as text
/// rather than parsed.
class ArticleScreen extends ConsumerWidget {
  const ArticleScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(articleProvider(slug));

    return Scaffold(
      appBar: AppBar(),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(asApiException(e).code.message(l),
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.muted, height: 1.7)),
          ),
        ),
        data: (a) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            Text(a.title,
                style: const TextStyle(
                    fontSize: 21, fontWeight: FontWeight.w800, height: 1.6)),
            const SizedBox(height: 16),
            Text(a.body ?? a.excerpt ?? '',
                style: const TextStyle(
                    fontSize: 15, height: 2.0, color: BrandColors.ink2)),
          ],
        ),
      ),
    );
  }
}
