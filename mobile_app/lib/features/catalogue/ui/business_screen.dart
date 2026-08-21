// Baytara for Business, from settings.business.
//
// Mirrors frontend/web/src/pages/Business.jsx. Every block is CMS-driven and hides itself
// when empty: `features` and `logos` are currently empty arrays on the live site, so this
// page must not render headings for content that does not exist.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../application/catalogue_providers.dart';
import '../data/site_settings.dart';
import '../../../core/theme/branded_title.dart';

class BusinessScreen extends ConsumerWidget {
  const BusinessScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(settingsProvider);

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(l.businessTitle)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(asApiException(e).code.message(l),
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.muted, height: 1.8)),
          ),
        ),
        data: (settings) {
          final b = settings.business;
          if (b.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(l.businessEmpty,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: BrandColors.muted2, height: 1.8)),
              ),
            );
          }
          return _Body(business: b);
        },
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.business});
  final BusinessCopy business;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        Container(
          width: double.infinity,
          decoration: const BoxDecoration(gradient: BrandGradients.darkPanel),
          padding: const EdgeInsets.fromLTRB(22, 30, 22, 30),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (business.eyebrow.isNotEmpty)
                Text(business.eyebrow,
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: BrandColors.gold)),
              const SizedBox(height: 10),
              Text(business.title,
                  style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      height: 1.5)),
              if (business.body.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(business.body,
                    style: TextStyle(
                        fontSize: 14,
                        height: 1.9,
                        color: Colors.white.withValues(alpha: 0.85))),
              ],
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => _contact(),
                  style: FilledButton.styleFrom(
                    backgroundColor: BrandColors.gold,
                    foregroundColor: BrandColors.ink,
                  ),
                  child: Text(business.primaryCta.isNotEmpty
                      ? business.primaryCta
                      : l.settingsContact),
                ),
              ),
            ],
          ),
        ),
        if (business.stats.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 22, horizontal: 12),
            child: Row(
              children: [
                for (final s in business.stats.where((s) => !s.isEmpty))
                  Expanded(
                    child: Column(children: [
                      Text(s.num,
                          textDirection: TextDirection.ltr,
                          style: const TextStyle(
                              fontSize: 19,
                              fontWeight: FontWeight.w800,
                              color: BrandColors.accent)),
                      const SizedBox(height: 3),
                      Text(s.label,
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11, height: 1.4, color: BrandColors.muted2)),
                    ]),
                  ),
              ],
            ),
          ),
        // Empty on the live site today, so the heading only appears with content behind it.
        if (business.features.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 6, 20, 0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (final f in business.features)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(f.title,
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w700)),
                        if (f.body.isNotEmpty) ...[
                          const SizedBox(height: 5),
                          Text(f.body,
                              style: const TextStyle(
                                  fontSize: 13.5,
                                  height: 1.8,
                                  color: BrandColors.muted)),
                        ],
                      ],
                    ),
                  ),
              ],
            ),
          ),
        if (business.trust.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 30),
            child: Text(business.trust,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 12.5, height: 1.8, color: BrandColors.muted2)),
          ),
        const SizedBox(height: 20),
      ],
    );
  }

  /// The contact form lives on the website; there is no B2B enquiry endpoint in the API.
  Future<void> _contact() async {
    final uri = Uri.parse('https://baytara.app/contact');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}
