// The checkout flow.
//
// The rule under test throughout: the gateway's redirect is never proof of payment. It is
// attacker controllable and can arrive before the webhook lands, so only GET /payment/<id>
// decides the outcome.
import 'package:baytara/core/network/api_error.dart';
import 'package:baytara/features/payments/application/checkout_controller.dart';
import 'package:baytara/features/payments/data/payment_dto.dart';
import 'package:baytara/features/payments/data/payment_repository.dart';
import 'package:flutter_test/flutter_test.dart';

class FakePaymentRepo implements PaymentRepository {
  FakePaymentRepo(this.responses);

  /// Answers handed out in order, so a test can make a payment settle on the third poll.
  final List<Object> responses;
  int calls = 0;

  @override
  Future<Payment> payment(int id) async {
    final answer = responses[calls.clamp(0, responses.length - 1)];
    calls++;
    if (answer is ApiErrorCode) throw ApiException(code: answer, statusCode: 500);
    return answer as Payment;
  }

  /// The code the screen sent, so a test can assert it was passed through rather than
  /// dropped on the way to the server.
  String? lastQuoteCode;
  String? lastCheckoutCode;

  @override
  Future<PaymentQuote> quote({
    required PaymentKind kind, int? courseId, int? bundleId, int? videoId, String? code,
  }) async {
    lastQuoteCode = code;
    return const PaymentQuote(kind: PaymentKind.enroll, expectedAmount: 450, title: 't');
  }

  @override
  Future<CheckoutSession> checkout({
    required PaymentKind kind, int? courseId, int? bundleId, int? videoId, String? code,
  }) async {
    lastCheckoutCode = code;
    return const CheckoutSession(url: 'https://gateway.test/pay/1', paymentId: 1);
  }

  @override
  Future<List<Payment>> history() async => const [];

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

Payment _payment(String status) => Payment(
      id: 1,
      kind: PaymentKind.enroll,
      status: status,
      amount: 450,
      currency: 'EGP',
    );

/// No real waiting; the poller's schedule is exercised without the wall clock.
Future<void> _noWait(Duration _) async {}

void main() {
  _promoTests();
  group('payment status', () {
    test('only paid is paid', () {
      expect(_payment('paid').isPaid, isTrue);
      expect(_payment('pending').isPaid, isFalse);
      expect(_payment('failed').isPaid, isFalse);
    });

    test('pending is the only unsettled state', () {
      expect(_payment('pending').isSettled, isFalse);
      for (final s in ['paid', 'failed', 'cancelled', 'refunded']) {
        expect(_payment(s).isSettled, isTrue, reason: s);
      }
    });
  });

  group('polling', () {
    test('stops as soon as the payment settles', () async {
      final repo = FakePaymentRepo([
        _payment('pending'),
        _payment('pending'),
        _payment('paid'),
        _payment('paid'),
      ]);
      final result =
          await const PaymentPoller().poll(repo, 1, wait: _noWait);

      expect(result!.isPaid, isTrue);
      expect(repo.calls, 3, reason: 'no further asking once the answer is final');
    });

    test('a failure mid-poll does not end the poll', () async {
      final repo = FakePaymentRepo([
        ApiErrorCode.network,
        _payment('pending'),
        _payment('paid'),
      ]);
      final result = await const PaymentPoller().poll(repo, 1, wait: _noWait);
      expect(result!.isPaid, isTrue,
          reason: 'a dropped request is not an answer about the payment');
    });

    test('giving up returns null rather than inventing a failure', () async {
      final repo = FakePaymentRepo([_payment('pending')]);
      final result = await const PaymentPoller().poll(repo, 1, wait: _noWait);
      expect(result, isNull,
          reason: 'a bank transfer can settle later; the webhook is still the truth');
    });

    test('the delays back off instead of hammering', () {
      final delays = const PaymentPoller().delays;
      for (var i = 1; i < delays.length; i++) {
        expect(delays[i], greaterThan(delays[i - 1]));
      }
    });
  });

  group('the redirect is not proof', () {
    test('a success redirect over a pending payment does not report paid', () async {
      final repo = FakePaymentRepo([_payment('pending')]);
      final c = CheckoutController(
        repository: repo,
        poller: const PaymentPoller(delays: [Duration.zero]),
      );

      await c.confirm(1, redirectStatus: 'success');

      expect(c.state.stage, CheckoutStage.stillPending,
          reason: 'the server said pending; the URL parameter is not evidence');
      c.dispose();
    });

    test('a fail redirect over a paid payment still reports paid', () async {
      // The mirror case, and the reason the redirect is ignored in both directions.
      final repo = FakePaymentRepo([_payment('paid')]);
      final c = CheckoutController(
        repository: repo,
        poller: const PaymentPoller(delays: [Duration.zero]),
      );

      await c.confirm(1, redirectStatus: 'fail');

      expect(c.state.stage, CheckoutStage.paid);
      c.dispose();
    });
  });

  group('the callback URL', () {
    test('yields the payment id to ask about', () {
      final r = parsePaymentCallback(
          Uri.parse('https://baytara.app/payment/callback?status=success&pid=123'));
      expect(r.paymentId, 123);
      expect(r.status, 'success');
    });

    test('an unrelated deep link is ignored', () {
      final r = parsePaymentCallback(Uri.parse('https://baytara.app/courses/anatomy'));
      expect(r.paymentId, isNull);
    });

    test('a callback with no id yields nothing to poll', () {
      final r = parsePaymentCallback(
          Uri.parse('https://baytara.app/payment/callback?status=success'));
      expect(r.paymentId, isNull);
    });

    test('a non-numeric id is rejected rather than coerced', () {
      final r = parsePaymentCallback(
          Uri.parse('https://baytara.app/payment/callback?pid=../../admin'));
      expect(r.paymentId, isNull);
    });
  });

  group('payment kinds', () {
    test('all four the server accepts are represented', () {
      expect(PaymentKind.values.map((k) => k.wire).toSet(),
          {'enroll', 'renewal', 'bundle', 'video'});
    });

    test('an unknown kind falls back to enroll', () {
      expect(PaymentKind.fromWire('something'), PaymentKind.enroll);
    });

    test('a renewal quote carries the percentage that explains its price', () {
      final q = PaymentQuote.fromJson({
        'kind': 'renewal', 'expected_amount': 135.0, 'title': 'x', 'renewal_percent': 30.0,
      });
      expect(q.kind, PaymentKind.renewal);
      expect(q.renewalPercent, 30.0);
    });

    test('a non-renewal quote has no percentage', () {
      final q = PaymentQuote.fromJson(
          {'kind': 'enroll', 'expected_amount': 450.0, 'title': 'x', 'renewal_percent': null});
      expect(q.renewalPercent, isNull);
    });
  });
}

// ---- discount codes -------------------------------------------------------------------

void _promoTests() {
  test('a quote reads the discount the server worked out', () {
    final q = PaymentQuote.fromJson({
      'kind': 'enroll', 'expected_amount': 500, 'title': 't',
      'discount': 50, 'final_amount': 450, 'promo': {'code': 'SAVE10'},
    });
    expect(q.expectedAmount, 500);
    expect(q.discount, 50);
    expect(q.payable, 450);
    expect(q.promoCode, 'SAVE10');
    expect(q.promoError, isNull);
  });

  test('a refused code leaves the full price standing', () {
    final q = PaymentQuote.fromJson({
      'kind': 'enroll', 'expected_amount': 500, 'title': 't', 'promo_error': 'promo_expired',
    });
    expect(q.promoError, 'promo_expired');
    expect(q.payable, 500, reason: 'a bad code must not read as a free course');
    expect(q.discount, 0);
  });

  test('an older server that sends no final_amount still charges the list price', () {
    final q = PaymentQuote.fromJson({'kind': 'enroll', 'expected_amount': 500, 'title': 't'});
    expect(q.payable, 500);
  });
}
