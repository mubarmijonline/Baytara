// What a signed-in viewer who is not a verified vet sees on vet-only content.
//
// The same two parts as the website: the sentence says what to do and why, the button
// does it. A lone button carrying the whole sentence read as a label, and the client's
// complaint about the old "access required" wording was exactly that it named a problem
// without naming the step.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/theme/tokens.dart';

class VerifyToWatchPrompt extends StatelessWidget {
  const VerifyToWatchPrompt({super.key});

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: BrandColors.surfaceMuted,
            border: Border.all(color: BrandColors.line),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(children: [
            const Icon(Icons.verified_user_outlined, size: 18, color: BrandColors.muted2),
            const SizedBox(width: 10),
            Expanded(
              child: Text(l.verifyToWatch,
                  style: const TextStyle(
                      fontSize: 13.5, height: 1.6, fontWeight: FontWeight.w600,
                      color: BrandColors.ink2)),
            ),
          ]),
        ),
        const SizedBox(height: 10),
        FilledButton(
          onPressed: () => context.push('/verify'),
          child: Text(l.verifyNow),
        ),
      ],
    );
  }
}
