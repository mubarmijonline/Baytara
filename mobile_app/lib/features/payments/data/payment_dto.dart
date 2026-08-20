// Payment shapes, from backend/app/api/v1/payment.py and models/payment.py.
/// The four things that can be bought. `PAYMENT_KINDS` in models/payment.py.
///
/// The contract doc shows only `enroll`, which hides three flows. `renewal` is the one that
/// matters most: it is where an `access_expired` refusal and a lapsed enrolment both lead,
/// and it is priced at `renewal_percent()` of the course price (admin-set, default 30%),
/// not at full price.
enum PaymentKind {
  enroll('enroll'),
  renewal('renewal'),
  bundle('bundle'),
  video('video');

  const PaymentKind(this.wire);
  final String wire;

  static PaymentKind fromWire(String? v) =>
      PaymentKind.values.firstWhere((k) => k.wire == v, orElse: () => PaymentKind.enroll);
}

/// What a purchase will cost, before committing to it.
class PaymentQuote {
  const PaymentQuote({
    required this.kind,
    required this.expectedAmount,
    required this.title,
    this.renewalPercent,
  });

  factory PaymentQuote.fromJson(Map<String, dynamic> j) => PaymentQuote(
        kind: PaymentKind.fromWire(j['kind'] as String?),
        expectedAmount: (j['expected_amount'] as num?)?.toDouble() ?? 0,
        title: j['title'] as String? ?? '',
        // Only present for a renewal. Worth showing: "30% of the original price" explains
        // the number far better than the number alone.
        renewalPercent: (j['renewal_percent'] as num?)?.toDouble(),
      );

  final PaymentKind kind;
  final double expectedAmount;
  final String title;
  final double? renewalPercent;
}

/// A payment row. Status is the server's word, never inferred from a redirect.
class Payment {
  const Payment({
    required this.id,
    required this.kind,
    required this.status,
    required this.amount,
    required this.currency,
    this.courseId,
    this.bundleId,
    this.videoId,
    this.paymentMethod,
    this.referenceNumber,
    this.refundedAmount = 0,
    this.createdAt,
    this.paidAt,
  });

  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: (j['id'] as num).toInt(),
        kind: PaymentKind.fromWire(j['kind'] as String?),
        status: j['status'] as String? ?? 'pending',
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        currency: j['currency'] as String? ?? 'EGP',
        courseId: (j['course_id'] as num?)?.toInt(),
        bundleId: (j['bundle_id'] as num?)?.toInt(),
        videoId: (j['video_id'] as num?)?.toInt(),
        paymentMethod: j['payment_method'] as String?,
        referenceNumber: j['reference_number'] as String?,
        refundedAmount: (j['refunded_amount'] as num?)?.toDouble() ?? 0,
        createdAt: DateTime.tryParse(j['created_at'] as String? ?? ''),
        paidAt: DateTime.tryParse(j['paid_at'] as String? ?? ''),
      );

  final int id;
  final PaymentKind kind;

  /// `pending` | `paid` | `failed` | `refunded` and similar. Only the server sets this, and
  /// only the webhook can make it `paid`.
  final String status;
  final double amount;
  final String currency;
  final int? courseId;
  final int? bundleId;
  final int? videoId;
  final String? paymentMethod;
  final String? referenceNumber;
  final double refundedAmount;
  final DateTime? createdAt;
  final DateTime? paidAt;

  bool get isPaid => status == 'paid';
  bool get isPending => status == 'pending';
  bool get isRefunded => refundedAmount > 0;

  /// Terminal states, where polling should stop.
  bool get isSettled => status != 'pending';
}

/// What POST /payment/checkout returns: a hosted gateway URL and the row to poll.
class CheckoutSession {
  const CheckoutSession({required this.url, required this.paymentId});

  factory CheckoutSession.fromJson(Map<String, dynamic> j) => CheckoutSession(
        url: j['url'] as String,
        paymentId: (j['payment_id'] as num).toInt(),
      );

  final String url;
  final int paymentId;
}
