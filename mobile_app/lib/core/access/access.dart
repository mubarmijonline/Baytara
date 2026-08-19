// What a card is allowed to say about access, in one place.
//
// The backend exposes access state in *two different shapes* and it is easy to assume they
// are the same thing:
//
//   GET /videos and /videos/<id>   `_public_video_dict` in backend/app/api/v1/video.py adds
//                                  can_play, requires_auth, requires_phone on top of the
//                                  model fields.
//   everything else                Course.to_dict and Lesson.to_dict give only
//                                  `lock_reason`, `is_paid` and `access_type`. A video
//                                  inside a course tree has NO can_play field.
//
// So playability inside a course has to be derived, and deriving it in each widget is how
// two screens end up disagreeing about the same lesson. [AccessState.resolve] is the single
// derivation; it mirrors `audience_error` and the phone gate in the backend.
//
// This never grants access. The server decides, every time, at POST /video/playback. This
// only decides what the UI *says* before the user taps.
import '../../features/auth/domain/session.dart';

/// The four tiers, from backend/app/services/catalog_access.py.
enum AccessTier {
  /// Anyone with an account.
  free('free'),

  /// Free, but verified veterinarians only.
  vetFree('vet_free'),

  /// Paid, verified veterinarians only.
  baytarian('baytarian'),

  /// Paid, and a verified vet is *refused* it.
  general('general');

  const AccessTier(this.wire);
  final String wire;

  static AccessTier fromWire(String? value) => switch (value) {
        'free' => free,
        'vet_free' => vetFree,
        'baytarian' => baytarian,
        _ => general,
      };

  bool get isPaid => this == baytarian || this == general;
}

/// Why a card is locked, or [none].
enum LockReason {
  none,

  /// Not signed in.
  needsAccount,

  /// Signed in, but no phone number. The watermark needs one.
  needsPhone,

  /// Needs veterinary verification.
  needsBaytarian,

  /// This tier is for non-veterinarians, and this user is a verified vet.
  nonVeterinariansOnly,

  /// Costs money and has not been bought.
  needsPurchase,
}

class AccessState {
  const AccessState({required this.tier, required this.reason});

  final AccessTier tier;
  final LockReason reason;

  bool get isOpen => reason == LockReason.none;

  /// Derive what the UI should say.
  ///
  /// [serverLockReason] is the `lock_reason` string the API sent, which encodes the
  /// audience rule only. [canPlay] is the authoritative flag, present on /videos responses
  /// and null everywhere else; when it is present it wins outright.
  /// [entitled] is true when the user already owns or is enrolled in the item.
  static AccessState resolve({
    required SessionState session,
    required AccessTier tier,
    String? serverLockReason,
    bool? canPlay,
    bool entitled = false,
  }) {
    // The server already answered. Nothing derived should override it.
    if (canPlay == true) return AccessState(tier: tier, reason: LockReason.none);

    if (session is! SessionSignedIn) {
      return AccessState(tier: tier, reason: LockReason.needsAccount);
    }
    final user = session.user;

    // The audience rule, as the server computed it. Trusted over any local guess because
    // is_baytarian can change server-side between the session load and this render.
    switch (serverLockReason) {
      case 'needs_baytarian':
        return AccessState(tier: tier, reason: LockReason.needsBaytarian);
      case 'non_veterinarians_only':
        return AccessState(tier: tier, reason: LockReason.nonVeterinariansOnly);
    }

    // No server reason: apply the same rule locally, so a card is right even on an
    // endpoint that omits lock_reason.
    if ((tier == AccessTier.vetFree || tier == AccessTier.baytarian) && !user.isBaytarian) {
      return AccessState(tier: tier, reason: LockReason.needsBaytarian);
    }
    if (tier == AccessTier.general && user.isBaytarian) {
      return AccessState(tier: tier, reason: LockReason.nonVeterinariansOnly);
    }

    // Paid content the user has not bought. Checked after the audience rule because that
    // is the order the server uses: a vet refused `general` is told why, not asked to pay.
    if (tier.isPaid && !entitled) {
      return AccessState(tier: tier, reason: LockReason.needsPurchase);
    }

    // The phone gate is last among the *user* checks but blocks playback absolutely: the
    // number is burnt into the watermark, so POST /video/playback refuses `phone_required`
    // however entitled the account is.
    if (!user.hasPhone) {
      return AccessState(tier: tier, reason: LockReason.needsPhone);
    }

    return AccessState(tier: tier, reason: LockReason.none);
  }
}
