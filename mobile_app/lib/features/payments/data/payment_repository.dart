// ignore_for_file: prefer_initializing_formals
// The payment endpoints.
//
// One rule governs this whole file: **the redirect is not proof of payment.** The gateway
// sends the user back to /payment/callback?status=success, but that parameter is attacker
// controllable and arrives before the webhook may have landed. Only GET /payment/<id> is
// authoritative, and only the Fawaterak webhook can move a row to `paid`.
import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';
import 'payment_dto.dart';

class PaymentRepository {
  PaymentRepository({required ApiClient client}) : _client = client;
  final ApiClient _client;
  Dio get _dio => _client.raw;

  /// What a purchase will cost. Exactly one target id is sent, matching the kind.
  Future<PaymentQuote> quote({
    required PaymentKind kind,
    int? courseId,
    int? bundleId,
    int? videoId,
  }) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>(
        '/payment/quote',
        queryParameters: {
          'kind': kind.wire,
          'course_id': ?courseId,
          'bundle_id': ?bundleId,
          'video_id': ?videoId,
        },
      );
      return PaymentQuote.fromJson(res.data ?? const {});
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// Creates a pending payment and returns the hosted gateway URL.
  Future<CheckoutSession> checkout({
    required PaymentKind kind,
    int? courseId,
    int? bundleId,
    int? videoId,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>('/payment/checkout', data: {
        'kind': kind.wire,
        'course_id': ?courseId,
        'bundle_id': ?bundleId,
        'video_id': ?videoId,
      });
      return CheckoutSession.fromJson(res.data!);
    } catch (e) {
      throw asApiException(e);
    }
  }

  /// The authoritative state of one payment.
  Future<Payment> payment(int id) async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/payment/$id');
      final body = res.data ?? const {};
      final row = body['payment'];
      return Payment.fromJson(
          row is Map ? row.cast<String, dynamic>() : body);
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<List<Payment>> history() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/payment/mine');
      return [
        for (final p in (res.data?['payments'] as List? ?? const []))
          Payment.fromJson((p as Map).cast<String, dynamic>()),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }
}
