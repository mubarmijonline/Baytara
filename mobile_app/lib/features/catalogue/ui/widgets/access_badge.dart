// The tier chip and the lock line, in one place.
//
// These two say what a user may do with an item, so they are the visible half of
// AccessState. The rule they exist to keep: a badge never promises more than the server
// will grant, and it never asks a user to pay for a tier they are barred from.
import 'package:flutter/material.dart';

import '../../../../core/access/access.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/theme/tokens.dart';

String tierLabel(AccessTier tier, L10n l) => switch (tier) {
      AccessTier.free => l.tierFree,
      AccessTier.vetFree => l.tierVetFree,
      AccessTier.baytarian => l.tierBaytarian,
      AccessTier.general => l.tierGeneral,
    };

/// Tone carries meaning, so it never travels alone: each chip is labelled too, which is
/// also what keeps it readable for anyone who cannot separate the colours.
Color tierTone(AccessTier tier) => switch (tier) {
      AccessTier.free => const Color(0xFF1A7F4B),
      AccessTier.vetFree => const Color(0xFF2B6CB0),
      AccessTier.baytarian => BrandColors.gold,
      AccessTier.general => BrandColors.accent,
    };

String lockLabel(LockReason reason, L10n l) => switch (reason) {
      LockReason.none => l.unlocked,
      LockReason.needsAccount => l.lockNeedsAccount,
      LockReason.needsPhone => l.lockNeedsPhone,
      LockReason.needsBaytarian => l.lockNeedsBaytarian,
      LockReason.nonVeterinariansOnly => l.lockNonVets,
      LockReason.needsPurchase => l.lockNeedsPurchase,
    };

class TierChip extends StatelessWidget {
  const TierChip({super.key, required this.tier});
  final AccessTier tier;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final tone = tierTone(tier);
    final label = tierLabel(tier, l);
    return Semantics(
      label: label,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: tone.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          label,
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: tone),
        ),
      ),
    );
  }
}

/// The one line under a card that says what stands between the user and the content.
class LockLine extends StatelessWidget {
  const LockLine({super.key, required this.access});
  final AccessState access;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    if (access.isOpen) return const SizedBox.shrink();

    // A padlock reads as "you cannot have this". The three states that are really an
    // invitation get their own glyph so the card does not feel like a refusal.
    final icon = switch (access.reason) {
      LockReason.needsPurchase => Icons.shopping_bag_outlined,
      LockReason.needsAccount => Icons.login,
      LockReason.needsPhone => Icons.phone_outlined,
      _ => Icons.lock_outline,
    };

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: BrandColors.muted2),
        const SizedBox(width: 4),
        Flexible(
          child: Text(
            lockLabel(access.reason, l),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontSize: 11.5, color: BrandColors.muted2),
          ),
        ),
      ],
    );
  }
}
