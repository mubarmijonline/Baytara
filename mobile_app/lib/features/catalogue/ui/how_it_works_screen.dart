// "How it works" — the hero's secondary call to action.
//
// Explains the one thing about this platform that genuinely confuses people: there are four
// access tiers, and which content you can watch depends on whether your veterinary
// registration has been verified, not only on what you have paid for. Getting that wrong is
// the most common reason a learner thinks something is broken.
//
// Reached with push(), not go(), so the back gesture returns to Home instead of closing the
// app.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/theme/branded_title.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/domain/session.dart';

class HowItWorksScreen extends ConsumerWidget {
  const HowItWorksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final session = ref.watch(sessionProvider);
    final signedIn = session is SessionSignedIn;
    final isVet = signedIn && session.user.isBaytarian;

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(l.howItWorksTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          Text(l.howItWorksIntro,
              style: const TextStyle(
                  fontSize: 14.5, height: 2.0, color: BrandColors.muted)),
          const SizedBox(height: 26),

          // The steps are marked done against the user's actual state, so the page doubles
          // as a checklist rather than being generic marketing.
          _Step(
            number: 1,
            title: l.howStep1Title,
            body: l.howStep1Body,
            done: signedIn,
            actionLabel: signedIn ? null : l.authSignUp,
            onAction: () => context.push('/auth'),
          ),
          _Step(
            number: 2,
            title: l.howStep2Title,
            body: l.howStep2Body,
            done: signedIn && session.user.hasPhone,
            actionLabel:
                signedIn && !session.user.hasPhone ? l.phoneSave : null,
            onAction: () => context.push('/auth/phone'),
          ),
          _Step(
            number: 3,
            title: l.howStep3Title,
            body: l.howStep3Body,
            done: isVet,
            actionLabel: signedIn && !isVet ? l.lockNeedsBaytarian : null,
            onAction: () => context.push('/verify'),
          ),
          _Step(
            number: 4,
            title: l.howStep4Title,
            body: l.howStep4Body,
            done: false,
            actionLabel: l.coursesTitle,
            onAction: () => context.go('/courses'),
            last: true,
          ),

          const SizedBox(height: 26),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: BrandColors.surfaceMuted,
              border: Border.all(color: BrandColors.line),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  const Icon(Icons.shield_outlined,
                      size: 18, color: BrandColors.accent),
                  const SizedBox(width: 8),
                  Text(l.howProtectionTitle,
                      style: const TextStyle(
                          fontSize: 14.5, fontWeight: FontWeight.w700)),
                ]),
                const SizedBox(height: 8),
                // Said plainly rather than implied: the watermark carries their own details,
                // and people should know that before they press play.
                Text(l.howProtectionBody,
                    style: const TextStyle(
                        fontSize: 13, height: 1.9, color: BrandColors.muted)),
              ],
            ),
          ),
          const SizedBox(height: 20),
          OutlinedButton(
            onPressed: () => context.push('/pricing'),
            child: Text(l.pricingTitle),
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({
    required this.number,
    required this.title,
    required this.body,
    required this.done,
    this.actionLabel,
    this.onAction,
    this.last = false,
  });

  final int number;
  final String title;
  final String body;
  final bool done;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool last;

  @override
  Widget build(BuildContext context) => IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Column(children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: done ? const Color(0xFF1A7F4B) : BrandColors.accentSoft,
                  shape: BoxShape.circle,
                ),
                child: done
                    ? const Icon(Icons.check, size: 18, color: Colors.white)
                    : Center(
                        child: Text('$number',
                            style: const TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: BrandColors.accent)),
                      ),
              ),
              if (!last)
                Expanded(
                  child: Container(
                    width: 2,
                    margin: const EdgeInsets.symmetric(vertical: 4),
                    color: BrandColors.line,
                  ),
                ),
            ]),
            const SizedBox(width: 14),
            Expanded(
              child: Padding(
                padding: EdgeInsets.only(bottom: last ? 0 : 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w700, height: 1.4)),
                    const SizedBox(height: 5),
                    Text(body,
                        style: const TextStyle(
                            fontSize: 13.5, height: 1.85, color: BrandColors.muted)),
                    if (actionLabel != null && onAction != null) ...[
                      const SizedBox(height: 10),
                      OutlinedButton(
                        onPressed: onAction,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size(0, 38),
                          padding: const EdgeInsets.symmetric(horizontal: 14),
                        ),
                        child: Text(actionLabel!),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      );
}
