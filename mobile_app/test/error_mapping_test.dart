// The denial vocabulary. Two things are checked: that every code the backend can send is
// recognised, and that the ones with a distinct recovery path actually get one.
//
// `access_expired` is the case worth having a test for. It is absent from the contract doc,
// and treating it as plain `not_entitled` would send a lapsed customer to buy a course they
// already bought, at full price, instead of renewing it.
import 'package:baytara/core/i18n/error_copy.dart';
import 'package:baytara/core/network/api_error.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('every wire code round-trips', () {
    for (final code in ApiErrorCode.values) {
      expect(ApiErrorCode.fromWire(code.wire), code);
    }
  });

  test('an unrecognised code degrades rather than throwing', () {
    expect(ApiErrorCode.fromWire('something_new'), ApiErrorCode.unknown);
    expect(ApiErrorCode.fromWire(null), ApiErrorCode.unknown);
  });

  test('a lapsed entitlement leads to renewal, not a full-price purchase', () {
    expect(ApiErrorCode.accessExpired.recovery, PlaybackRecovery.renew);
    expect(ApiErrorCode.notEntitled.recovery, PlaybackRecovery.purchase);
    expect(ApiErrorCode.accessExpired.recovery,
        isNot(ApiErrorCode.notEntitled.recovery));
  });

  test('tier refusals route to their own remedy', () {
    expect(ApiErrorCode.needsBaytarian.recovery, PlaybackRecovery.verify);
    expect(ApiErrorCode.nonVeterinariansOnly.recovery, PlaybackRecovery.terminal);
    expect(ApiErrorCode.phoneRequired.recovery, PlaybackRecovery.phoneGate);
    expect(ApiErrorCode.deviceLimitReached.recovery, PlaybackRecovery.devices);
  });

  test('the capability-gate codes are flagged as our bug, not the user\'s problem', () {
    for (final code in [
      ApiErrorCode.appRequired,
      ApiErrorCode.macNeedsSafari,
      ApiErrorCode.unsupportedBrowser,
      ApiErrorCode.browserNotSupported,
    ]) {
      expect(code.indicatesMissingAppUserAgent, isTrue);
    }
    expect(ApiErrorCode.notEntitled.indicatesMissingAppUserAgent, isFalse);
  });

  test('malformed playback events are flagged as a client bug', () {
    expect(ApiErrorCode.invalidEventType.indicatesClientBug, isTrue);
    expect(ApiErrorCode.sessionClosed.indicatesClientBug, isFalse);
  });

  test('field errors are read out of the validation shape the API uses', () {
    const e = ApiException(
      code: ApiErrorCode.validation,
      statusCode: 422,
      data: {'messages': {'phone': ['phone_invalid']}},
    );
    expect(e.fieldErrors['phone'], ['phone_invalid']);
  });
}
