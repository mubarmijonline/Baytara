// The device-swap allowance, which the server spells two different ways.
import 'package:baytara/core/network/api_error.dart';
import 'package:baytara/features/auth/data/auth_dto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('SwapAllowance', () {
    test('reads the GET /auth/devices spelling', () {
      final a = SwapAllowance.fromJson({
        'swaps_used': 1,
        'swaps_allowed': 2,
        'swaps_reset_at': '2026-12-01T00:00:00+00:00',
      });
      expect(a.used, 1);
      expect(a.allowed, 2);
      expect(a.exhausted, isFalse);
      expect(a.resetsAt, isNotNull);
    });

    test('reads the 403 refusal spelling, which is not the same one', () {
      final refusal = {
        'error': 'device_swap_limit_reached',
        'used': 1,
        'allowed': 1,
        'resets_at': '2026-12-01T00:00:00+00:00',
      };
      final a = SwapAllowance.fromRefusal(refusal);
      expect(a.used, 1);
      expect(a.allowed, 1);
      expect(a.exhausted, isTrue);

      // The proof that one parser cannot serve both: the list spelling reads the refusal
      // as a fresh allowance and would tell a blocked user they have a change left.
      expect(SwapAllowance.fromJson(refusal).exhausted, isFalse);
    });

    test('an admin grant raises the ceiling rather than being assumed to be one', () {
      final a = SwapAllowance.fromJson({'swaps_used': 1, 'swaps_allowed': 2});
      expect(a.exhausted, isFalse);
    });

    test('no window open yet means no reset date to promise', () {
      final a = SwapAllowance.fromJson({'swaps_used': 0, 'swaps_allowed': 1});
      expect(a.resetsAt, isNull);
    });
  });

  group('DeviceList', () {
    test('carries the allowance and a pending request', () {
      final list = DeviceList.fromJson({
        'devices': [
          {'id': 1, 'device_id': 'abc', 'label': 'Pixel 8', 'last_seen': null},
        ],
        'max_devices': 2,
        'swaps_used': 1,
        'swaps_allowed': 1,
        'swap_request': {
          'id': 7,
          'status': 'pending',
          'reason': 'سرقة الهاتف',
          'created_at': '2026-09-20T10:00:00+00:00',
        },
      });

      expect(list.devices.single.label, 'Pixel 8');
      expect(list.allowance.exhausted, isTrue);
      expect(list.swapRequest!.isPending, isTrue);
      expect(list.swapRequest!.id, 7);
    });

    test('a device-limit refusal carries no allowance, and none is invented', () {
      // What POST /auth/login answers with: the machines and the cap, no token, no counts.
      final list = DeviceList.fromJson({
        'error': 'device_limit_reached',
        'max_devices': 2,
        'devices': [
          {'id': 1, 'device_id': 'abc'},
          {'id': 2, 'device_id': 'def'},
        ],
      });
      expect(list.devices, hasLength(2));
      expect(list.swapRequest, isNull);
      expect(list.allowance.exhausted, isFalse,
          reason: 'claiming the swap is spent would send a user to an admin they do not need');
    });
  });

  group('error codes', () {
    test('the two swap codes are recognised rather than falling through to unknown', () {
      expect(ApiErrorCode.fromWire('device_swap_limit_reached'),
          ApiErrorCode.deviceSwapLimitReached);
      expect(ApiErrorCode.fromWire('swap_still_available'),
          ApiErrorCode.swapStillAvailable);
    });
  });
}
