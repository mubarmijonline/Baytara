// The four access tiers, explained honestly.
//
// Mirrors frontend/web/src/pages/Pricing.jsx, and the ordering there is deliberate: what
// anyone can watch, then what verification opens, then what is paid. `general` is described
// as the paid tier for people who are NOT veterinarians, because that is what it is -- not
// "paid, open to everyone". A verified vet is refused it.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/access/access.dart';
import '../../../core/i18n/app_localizations.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/domain/session.dart';
import '../../payments/data/purchase_availability.dart';
import 'widgets/access_badge.dart';

class PricingScreen extends ConsumerWidget {
  const PricingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final session = ref.watch(sessionProvider);
    final isVet =
        session is SessionSignedIn && session.user.isBaytarian;

    return Scaffold(
      appBar: AppBar(title: Text(l.pricingTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
        children: [
          Text(l.pricingIntro,
              style: const TextStyle(
                  fontSize: 14, height: 1.9, color: BrandColors.muted)),
          const SizedBox(height: 22),
          for (final tier in AccessTier.values)
            _TierCard(tier: tier, isVet: isVet, signedIn: session is SessionSignedIn),
          if (!PurchaseAvailability.purchasesEnabled) ...[
            const SizedBox(height: 8),
            Text(l.checkoutUnavailableOnThisPlatform,
                style: const TextStyle(
                    fontSize: 12.5, height: 1.8, color: BrandColors.muted2)),
          ],
        ],
      ),
    );
  }
}

class _TierCard extends StatelessWidget {
  const _TierCard({required this.tier, required this.isVet, required this.signedIn});

  final AccessTier tier;
  final bool isVet;
  final bool signedIn;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final tone = tierTone(tier);

    final description = switch (tier) {
      AccessTier.free => l.pricingFreeBody,
      AccessTier.vetFree => l.pricingVetFreeBody,
      AccessTier.baytarian => l.pricingBaytarianBody,
      AccessTier.general => l.pricingGeneralBody,
    };

    // What this particular reader should do next, which is not the same for everyone.
    // A verified vet looking at `general` is not a customer for it and is told so.
    final (actionLabel, route) = switch (tier) {
      _ when !signedIn => (l.authSignIn, '/auth'),
      AccessTier.free => (null, null),
      AccessTier.vetFree || AccessTier.baytarian when !isVet => (
          l.lockNeedsBaytarian,
          '/verify'
        ),
      AccessTier.general when isVet => (null, null),
      _ => (l.coursesTitle, '/courses'),
    };

    final barred = tier == AccessTier.general && isVet;

    return Card(
      margin: const EdgeInsets.only(bottom: 14),
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(color: tone, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Text(tierLabel(tier, l),
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w800)),
              const Spacer(),
              if (!tier.isPaid)
                Text(l.priceFree,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF1A7F4B))),
            ]),
            const SizedBox(height: 10),
            Text(description,
                style: const TextStyle(
                    fontSize: 13.5, height: 1.9, color: BrandColors.muted)),
            if (barred) ...[
              const SizedBox(height: 12),
              Text(l.lockNonVets,
                  style: const TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w600,
                      color: BrandColors.muted2)),
            ],
            if (actionLabel != null && route != null) ...[
              const SizedBox(height: 14),
              OutlinedButton(
                onPressed: () => context.push(route),
                child: Text(actionLabel),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
