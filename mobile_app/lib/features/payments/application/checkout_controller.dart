// ignore_for_file: prefer_initializing_formals
// The checkout flow, end to end.
//
//   quote -> hosted gateway in a Custom Tab -> deep-link return -> poll GET /payment/<id>
//
// The security rule, stated once and enforced in one place: **the redirect parameters are
// not proof of payment.** `?status=success` is attacker controllable and can arrive before
// the Fawaterak webhook has landed. The deep link is only a signal to *start asking*; the
// answer always comes from GET /payment/<id>.
import 'dart:async';

import '../../../core/network/api_error.dart';
import '../data/payment_dto.dart';
import '../data/payment_repository.dart';

enum CheckoutStage {
  idle,

  /// Fetching the quote.
  quoting,

  /// The gateway is open and the user is away in the browser.
  atGateway,

  /// Back from the gateway, asking the server what actually happened.
  confirming,

  /// The server says paid.
  paid,

  /// The server says the attempt did not succeed.
  failed,

  /// Still pending after we stopped asking. Not a failure: a bank transfer can settle
  /// minutes later, and the webhook will record it.
  stillPending,
}

class CheckoutState {
  const CheckoutState({
    this.stage = CheckoutStage.idle,
    this.quote,
    this.payment,
    this.error,
  });

  final CheckoutStage stage;
  final PaymentQuote? quote;
  final Payment? payment;
  final ApiErrorCode? error;

  CheckoutState copyWith({
    CheckoutStage? stage,
    PaymentQuote? quote,
    Payment? payment,
    ApiErrorCode? error,
    bool clearError = false,
  }) =>
      CheckoutState(
        stage: stage ?? this.stage,
        quote: quote ?? this.quote,
        payment: payment ?? this.payment,
        error: clearError ? null : (error ?? this.error),
      );
}

/// Polls a payment until it settles.
///
/// Backs off rather than hammering: a card settles in seconds, a bank transfer can take
/// minutes, and a tight loop would achieve nothing except load. Giving up returns
/// [CheckoutStage.stillPending], which is deliberately not "failed" -- the webhook remains
/// the source of truth and may record the payment after the app has stopped watching.
class PaymentPoller {
  const PaymentPoller({
    this.delays = const [
      Duration(seconds: 1),
      Duration(seconds: 2),
      Duration(seconds: 3),
      Duration(seconds: 5),
      Duration(seconds: 8),
      Duration(seconds: 13),
    ],
  });

  final List<Duration> delays;

  Future<Payment?> poll(
    PaymentRepository repo,
    int paymentId, {
    Future<void> Function(Duration)? wait,
  }) async {
    final sleep = wait ?? Future<void>.delayed;
    for (final delay in delays) {
      await sleep(delay);
      try {
        final payment = await repo.payment(paymentId);
        if (payment.isSettled) return payment;
      } on ApiException {
        // A dropped request mid-poll is not an answer. Keep trying the remaining attempts.
      }
    }
    return null;
  }
}

class CheckoutController {
  CheckoutController({
    required PaymentRepository repository,
    PaymentPoller poller = const PaymentPoller(),
  })  : _repo = repository,
        _poller = poller;

  final PaymentRepository _repo;
  final PaymentPoller _poller;

  CheckoutState state = const CheckoutState();
  final _controller = StreamController<CheckoutState>.broadcast();
  Stream<CheckoutState> get stream => _controller.stream;

  void _emit(CheckoutState next) {
    state = next;
    if (!_controller.isClosed) _controller.add(next);
  }

  Future<PaymentQuote?> loadQuote({
    required PaymentKind kind,
    int? courseId,
    int? bundleId,
    int? videoId,
    String? code,
  }) async {
    _emit(state.copyWith(stage: CheckoutStage.quoting, clearError: true));
    try {
      final quote = await _repo.quote(
        kind: kind,
        courseId: courseId,
        bundleId: bundleId,
        videoId: videoId,
        code: code,
      );
      _emit(state.copyWith(stage: CheckoutStage.idle, quote: quote));
      return quote;
    } on ApiException catch (e) {
      _emit(state.copyWith(stage: CheckoutStage.failed, error: e.code));
      return null;
    }
  }

  /// Creates the payment and hands back the gateway URL for the caller to open.
  ///
  /// Opening it is the caller's job because only the UI layer knows how: a Custom Tab on
  /// Android, SFSafariViewController on iOS. What must never happen is opening it in a bare
  /// WebView, and never in the VdoCipher WebView.
  Future<CheckoutSession?> begin({
    required PaymentKind kind,
    int? courseId,
    int? bundleId,
    int? videoId,
    String? code,
  }) async {
    _emit(state.copyWith(stage: CheckoutStage.quoting, clearError: true));
    try {
      final session = await _repo.checkout(
        kind: kind,
        courseId: courseId,
        bundleId: bundleId,
        videoId: videoId,
        code: code,
      );
      _emit(state.copyWith(stage: CheckoutStage.atGateway));
      return session;
    } on ApiException catch (e) {
      _emit(state.copyWith(stage: CheckoutStage.failed, error: e.code));
      return null;
    }
  }

  /// Called when the deep link comes back, or when the user returns to the app.
  ///
  /// [redirectStatus] is read from the callback URL and used for **nothing except** deciding
  /// how hopeful the copy is while polling. It never sets the outcome.
  Future<void> confirm(int paymentId, {String? redirectStatus}) async {
    _emit(state.copyWith(stage: CheckoutStage.confirming, clearError: true));

    final settled = await _poller.poll(_repo, paymentId);
    if (settled == null) {
      _emit(state.copyWith(stage: CheckoutStage.stillPending));
      return;
    }
    _emit(state.copyWith(
      stage: settled.isPaid ? CheckoutStage.paid : CheckoutStage.failed,
      payment: settled,
    ));
  }

  void dispose() => _controller.close();
}

/// Reads `pid` and `status` out of the gateway's return URL.
///
/// The URL is `https://baytara.app/payment/callback?status=success&pid=123`. Only `pid` is
/// trusted, and only as an id to ask about.
({int? paymentId, String? status}) parsePaymentCallback(Uri uri) {
  if (!uri.path.contains('/payment/callback')) return (paymentId: null, status: null);
  final pid = int.tryParse(uri.queryParameters['pid'] ?? '');
  return (paymentId: pid, status: uri.queryParameters['status']);
}
