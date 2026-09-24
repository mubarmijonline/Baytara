// The server's error vocabulary, as one enum.
//
// The backend answers failures with a stable `{"error": "<code>"}` body. Every code it can
// return is listed here, read out of the running source rather than the contract doc --
// docs/FLUTTER_APP_PROMPT.md is missing several of them (see the plan, Part 0). One mapper,
// used by every screen, is what stops each feature inventing its own copy for the same
// failure.
//
// Sources:
//   backend/app/api/v1/video.py            playback + event denials
//   backend/app/services/catalog_access.py audience and entitlement reasons
//   backend/app/services/video_monitoring.py event payload validation
//   backend/app/api/v1/auth.py             sign-in and device binding
enum ApiErrorCode {
  // --- auth / session ---
  authenticationRequired('authentication_required'),
  invalidCredentials('invalid_credentials'),
  accountDisabled('account_disabled'),
  emailTaken('email_taken'),
  phoneRequired('phone_required'),
  /// The token identified a user that no longer exists or was deactivated. Returned by
  /// /auth/refresh and /auth/profile; means sign out, not retry.
  invalidUser('invalid_user'),
  invalidGoogleToken('invalid_google_token'),
  /// Google sign-in is not configured server-side (503). Hide the button rather than
  /// letting the user press something that cannot work.
  googleNotConfigured('google_not_configured'),
  notFound('not_found'),

  // --- device binding ---
  deviceRequired('device_required'),
  deviceMismatch('device_mismatch'),
  deviceNotRegistered('device_not_registered'),
  deviceLimitReached('device_limit_reached'),
  /// The account has already used its self-service device change for this window. Not a
  /// dead end: the emergency request below is what comes next.
  deviceSwapLimitReached('device_swap_limit_reached'),
  /// Asking an admin when the user could still swap a device themselves. Means send them
  /// back to the button, not into a queue.
  swapStillAvailable('swap_still_available'),

  // --- entitlement ---
  notEntitled('not_entitled'),
  /// A lapsed enrolment or entitlement. NOT the same as `notEntitled`: this user has paid
  /// before, and belongs in the renewal flow at `renewal_percent()` of the price, not on a
  /// full-price buy screen.
  accessExpired('access_expired'),
  needsBaytarian('needs_baytarian'),
  nonVeterinariansOnly('non_veterinarians_only'),
  notEnrolled('not_enrolled'),
  paymentRequired('payment_required'),

  // --- lesson / playback ---
  lessonNotFound('lesson_not_found'),
  invalidCourseContext('invalid_course_context'),
  noVideo('no_video'),
  alreadyPlaying('already_playing'),
  tooManyRequests('too_many_requests'),
  suspiciousActivity('suspicious_activity'),

  // --- client-capability gate ---
  // These four mean the server decided this client cannot defend the stream. In the app
  // they indicate the BaytaraApp/1 User-Agent marker went missing; see dio_client.dart.
  appRequired('app_required'),
  macNeedsSafari('mac_needs_safari'),
  unsupportedBrowser('unsupported_browser'),
  browserNotSupported('browser_not_supported'),

  // --- playback event stream ---
  sessionNotFound('session_not_found'),
  sessionClosed('session_closed'),
  eventIdConflict('event_id_conflict'),
  invalidEvent('invalid_event'),
  invalidEventType('invalid_event_type'),
  invalidEventId('invalid_event_id'),
  invalidEventMeasurement('invalid_event_measurement'),
  invalidEventMetadata('invalid_event_metadata'),

  // --- verification ---
  alreadyVerified('already_verified'),
  requestPending('request_pending'),
  nationalIdRequired('national_id_required'),
  cardNotVerified('card_not_verified'),

  // --- catch-alls ---
  validation('validation'),
  network('__network'),
  server('__server'),
  unknown('__unknown');

  const ApiErrorCode(this.wire);

  /// The literal string the backend sends.
  final String wire;

  static final _byWire = {for (final c in ApiErrorCode.values) c.wire: c};

  static ApiErrorCode fromWire(String? value) =>
      value == null ? unknown : (_byWire[value] ?? unknown);

  /// True when the four capability-gate codes appear. They are unreachable from a correctly
  /// configured app and mean the User-Agent marker was lost, so they are a bug signal rather
  /// than something to write user-facing copy for.
  bool get indicatesMissingAppUserAgent => const {
        appRequired,
        macNeedsSafari,
        unsupportedBrowser,
        browserNotSupported,
      }.contains(this);

  /// True when the client built a malformed playback event. Always a programming error --
  /// these must surface loudly in debug rather than being swallowed as "some network thing".
  bool get indicatesClientBug => const {
        invalidEvent,
        invalidEventType,
        invalidEventId,
        invalidEventMeasurement,
        invalidEventMetadata,
      }.contains(this);
}

/// A failed API call, carrying the parsed code plus whatever extra the endpoint returned.
///
/// `data` matters for more than debugging: `device_limit_reached` comes with `devices[]` and
/// `max_devices`, and a rejected verification comes with a `report`.
class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.statusCode,
    this.data,
    this.message,
  });

  final ApiErrorCode code;
  final int? statusCode;
  final Map<String, dynamic>? data;
  final String? message;

  /// Field-level validation errors, as returned by the register/profile endpoints in the
  /// shape `{"messages": {"phone": ["phone_invalid"]}}`.
  Map<String, List<String>> get fieldErrors {
    final messages = data?['messages'];
    if (messages is! Map) return const {};
    return {
      for (final entry in messages.entries)
        entry.key.toString(): [
          if (entry.value is List)
            for (final v in entry.value as List) v.toString()
          else
            entry.value.toString(),
        ],
    };
  }

  @override
  String toString() => 'ApiException(${code.wire}, status: $statusCode)';
}
