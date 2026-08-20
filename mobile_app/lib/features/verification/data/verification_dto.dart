// Verification shapes, from backend/app/api/v1/baytarian.py.
//
// There are three routes in and three outcomes out, and the outcomes are not a success/fail
// pair with a loading state. They are genuinely distinct answers, each needing its own
// screen and its own copy:
//
//   201  verified now (as a veterinarian, or as a student)
//   202  sent to a human -- NOT a failure, and the user must be told not to resubmit
//   422  could not be verified from this document, with a report explaining why
//
// Collapsing 202 into either neighbour is the mistake this file exists to prevent: treated
// as success the user is told they are verified when they are not; treated as failure they
// resubmit, and a second pending request is refused with `request_pending`.

/// How the user is proving they are a vet.
enum VerificationRoute {
  /// Photograph both sides of the syndicate card. The strictest route and the one that can
  /// verify outright.
  syndicateCard('card'),

  /// A national ID whose printed occupation reads طبيب بيطري.
  nationalId('national_id'),

  /// A college card, an enrolment letter, anything a model can read. The answer decides
  /// between veterinarian, student, and a human reviewer.
  otherDocument('other');

  const VerificationRoute(this.wire);
  final String wire;

  /// `national_id` and `other` post to /baytarian/document with this as `route`.
  /// The card has its own endpoint and sends no route field.
  bool get usesDocumentEndpoint => this != VerificationRoute.syndicateCard;
}

/// What the account currently is.
class VerificationStatus {
  const VerificationStatus({
    required this.isBaytarian,
    required this.isVetStudent,
    this.request,
  });

  factory VerificationStatus.fromJson(Map<String, dynamic> j) => VerificationStatus(
        isBaytarian: j['is_baytarian'] as bool? ?? false,
        // Records which kind of vet. Gates nothing: students and licensed doctors reach
        // identical content.
        isVetStudent: j['is_vet_student'] as bool? ?? false,
        request: j['request'] is Map
            ? VerificationRequest.fromJson(
                (j['request'] as Map).cast<String, dynamic>())
            : null,
      );

  final bool isBaytarian;
  final bool isVetStudent;
  final VerificationRequest? request;

  /// A request is already with a human. Submitting again would be refused with
  /// `request_pending`, so the UI must not offer it.
  bool get hasPendingRequest => request?.isPending ?? false;
}

class VerificationRequest {
  const VerificationRequest({
    required this.id,
    required this.status,
    this.note,
    this.createdAt,
    this.reviewedAt,
  });

  factory VerificationRequest.fromJson(Map<String, dynamic> j) => VerificationRequest(
        id: (j['id'] as num?)?.toInt() ?? 0,
        status: j['status'] as String? ?? 'pending',
        note: j['note'] as String?,
        createdAt: DateTime.tryParse(j['created_at'] as String? ?? ''),
        reviewedAt: DateTime.tryParse(j['reviewed_at'] as String? ?? ''),
      );

  final int id;
  final String status;
  final String? note;
  final DateTime? createdAt;
  final DateTime? reviewedAt;

  bool get isPending => status == 'pending';
  bool get isApproved => status == 'approved';
  bool get isRejected => status == 'rejected';
}

/// The three answers a submission can produce.
enum VerificationOutcome {
  /// Verified as a licensed veterinarian.
  verifiedVeterinarian,

  /// Verified as a veterinary student. Reaches the same content.
  verifiedStudent,

  /// 202. A human will decide. **Do not resubmit.**
  sentForReview,

  /// 422. The document could not be read or did not show what was needed.
  couldNotVerify,
}

class VerificationResult {
  const VerificationResult({
    required this.outcome,
    this.request,
    this.report,
    this.problem,
  });

  final VerificationOutcome outcome;
  final VerificationRequest? request;

  /// The reader's findings on a refusal, for showing what was and was not legible.
  final Map<String, dynamic>? report;

  /// The machine-readable reason on a 422, e.g. `card_not_verified`.
  final String? problem;

  bool get isVerified =>
      outcome == VerificationOutcome.verifiedVeterinarian ||
      outcome == VerificationOutcome.verifiedStudent;
}
