// Articles: the blog and the free-content shelf, which are one table on the server
// distinguished by `type` (ARTICLE_TYPES = blog | content).
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../application/catalogue_providers.dart';
import '../data/catalogue_dto.dart';

class ContentScreen extends ConsumerWidget {
  const ContentScreen({super.key, this.kind = 'content'});

  /// `content` for the free advisory shelf, `blog` for posts.
  final String kind;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(articlesProvider(kind));

    return Scaffold(
      appBar: AppBar(title: Text(kind == 'blog' ? l.blogTitle : l.tabContent)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(articlesProvider(kind)),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            Padding(
              padding: const EdgeInsets.all(32),
              child: Text(asApiException(e).code.message(l),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: BrandColors.muted, height: 1.7)),
            ),
          ]),
          data: (rows) => rows.isEmpty
              ? ListView(children: [
                  Padding(
                    padding: const EdgeInsets.all(40),
                    child: Center(
                      child: Text(l.noResults,
                          style: const TextStyle(color: BrandColors.muted2)),
                    ),
                  ),
                ])
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: rows.length,
                  itemBuilder: (context, i) => _ArticleCard(article: rows[i]),
                ),
        ),
      ),
    );
  }
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
