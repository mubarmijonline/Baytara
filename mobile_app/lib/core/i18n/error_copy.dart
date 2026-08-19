// One place that turns a server error code into a sentence the user reads.
//
// Every screen calls this. The alternative -- each feature writing its own copy for
// `not_entitled` -- is how an app ends up telling the same user three different things
// about the same refusal.
import '../network/api_error.dart';
import 'app_localizations.dart';

extension ApiErrorCopy on ApiErrorCode {
  String message(L10n l) => switch (this) {
        ApiErrorCode.authenticationRequired => l.errAuthRequired,
        ApiErrorCode.invalidCredentials => l.errInvalidCredentials,
        ApiErrorCode.accountDisabled => l.errAccountDisabled,
        ApiErrorCode.emailTaken => l.errEmailTaken,
        ApiErrorCode.phoneRequired => l.errPhoneRequired,
        ApiErrorCode.invalidUser => l.errAuthRequired,
        ApiErrorCode.invalidGoogleToken => l.errGoogleFailed,
        ApiErrorCode.googleNotConfigured => l.errGoogleUnavailable,

        ApiErrorCode.deviceLimitReached => l.errDeviceLimit,
        ApiErrorCode.deviceRequired ||
        ApiErrorCode.deviceMismatch ||
        ApiErrorCode.deviceNotRegistered =>
          l.errDeviceMismatch,

        ApiErrorCode.notEntitled ||
        ApiErrorCode.notEnrolled ||
        ApiErrorCode.paymentRequired =>
          l.errNotEntitled,
        ApiErrorCode.accessExpired => l.errAccessExpired,
        ApiErrorCode.needsBaytarian => l.errNeedsBaytarian,
        ApiErrorCode.nonVeterinariansOnly => l.errNonVetsOnly,

        ApiErrorCode.lessonNotFound => l.errLessonNotFound,
        ApiErrorCode.noVideo => l.errNoVideo,
        ApiErrorCode.alreadyPlaying => l.errAlreadyPlaying,
        ApiErrorCode.tooManyRequests => l.errTooManyRequests,
        ApiErrorCode.suspiciousActivity => l.errSuspicious,

        ApiErrorCode.network => l.errNetwork,
        ApiErrorCode.server => l.errServer,

        // Everything else -- the capability-gate codes, the malformed-event codes, the
        // verification and validation codes screens handle inline -- has no generic copy
        // worth showing. They are either our bug or need context this function lacks.
        _ => l.errUnknown,
      };
}

/// Where a playback refusal sends the user. Kept next to the copy so the two cannot drift.
///
/// Mirrors the denial order in backend/app/api/v1/video.py; see the plan, Part 2.
enum PlaybackRecovery {
  /// Sign in.
  signIn,

  /// Add a phone number, then come back.
  phoneGate,

  /// Manage devices, then come back.
  devices,

  /// Sign in again on this device.
  reAuth,

  /// Buy the thing at full price.
  purchase,

  /// Renew lapsed access at renewal_percent() of the price -- NOT a full-price purchase.
  renew,

  /// Get verified as a veterinarian.
  verify,

  /// Nothing to do; explain and stop.
  terminal,

  /// Wait, then the same action may work.
  retryLater,
}

extension PlaybackRecoveryFor on ApiErrorCode {
  PlaybackRecovery get recovery => switch (this) {
        ApiErrorCode.authenticationRequired ||
        ApiErrorCode.invalidUser =>
          PlaybackRecovery.signIn,
        ApiErrorCode.phoneRequired => PlaybackRecovery.phoneGate,
        ApiErrorCode.deviceLimitReached => PlaybackRecovery.devices,
        ApiErrorCode.deviceRequired ||
        ApiErrorCode.deviceMismatch ||
        ApiErrorCode.deviceNotRegistered =>
          PlaybackRecovery.reAuth,
        ApiErrorCode.notEntitled ||
        ApiErrorCode.notEnrolled ||
        ApiErrorCode.paymentRequired =>
          PlaybackRecovery.purchase,
        ApiErrorCode.accessExpired => PlaybackRecovery.renew,
        ApiErrorCode.needsBaytarian => PlaybackRecovery.verify,
        ApiErrorCode.alreadyPlaying ||
        ApiErrorCode.tooManyRequests ||
        ApiErrorCode.suspiciousActivity ||
        ApiErrorCode.network ||
        ApiErrorCode.server =>
          PlaybackRecovery.retryLater,
        _ => PlaybackRecovery.terminal,
      };
}
