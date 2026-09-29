// Verification outcomes.
//
// The whole point of these tests: 202 is neither success nor failure. Collapsing it into
// success tells the user they are verified when they are not; collapsing it into failure
// makes them resubmit, and the second request is refused with `request_pending`.
import 'package:baytara/features/verification/data/verification_dto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('routes', () {
    test('the card has its own endpoint; the other two post a route field', () {
      expect(VerificationRoute.syndicateCard.usesDocumentEndpoint, isFalse);
      expect(VerificationRoute.nationalId.usesDocumentEndpoint, isTrue);
      expect(VerificationRoute.otherDocument.usesDocumentEndpoint, isTrue);
    });

    test('the wire values match DOC_ROUTES on the server', () {
      expect(VerificationRoute.nationalId.wire, 'national_id');
      expect(VerificationRoute.otherDocument.wire, 'other');
    });
  });

  group('status', () {
    test('a pending request blocks a new submission', () {
      final s = VerificationStatus.fromJson({
        'is_baytarian': false,
        'is_vet_student': false,
        'request': {'id': 3, 'status': 'pending'},
      });
      expect(s.hasPendingRequest, isTrue,
          reason: 'offering the form again would earn a request_pending refusal');
    });

    test('a rejected request does not block a new one', () {
      final s = VerificationStatus.fromJson({
        'is_baytarian': false,
        'is_vet_student': false,
        'request': {'id': 3, 'status': 'rejected'},
      });
      expect(s.hasPendingRequest, isFalse);
    });

    test('no request at all is not a pending one', () {
      final s = VerificationStatus.fromJson(
          {'is_baytarian': false, 'is_vet_student': false, 'request': null});
      expect(s.hasPendingRequest, isFalse);
      expect(s.request, isNull);
    });

    test('a verified student is verified', () {
      final s = VerificationStatus.fromJson(
          {'is_baytarian': true, 'is_vet_student': true, 'request': null});
      expect(s.isBaytarian, isTrue);
      expect(s.isVetStudent, isTrue,
          reason: 'the flag records which kind of vet and gates nothing');
    });
  });

  group('outcomes', () {
    test('both grants count as verified', () {
      for (final o in [
        VerificationOutcome.verifiedVeterinarian,
        VerificationOutcome.verifiedStudent,
      ]) {
        expect(VerificationResult(outcome: o).isVerified, isTrue, reason: o.name);
      }
    });

    test('sent-for-review is NOT verified', () {
      const r = VerificationResult(outcome: VerificationOutcome.sentForReview);
      expect(r.isVerified, isFalse,
          reason: 'telling the user they are verified when a human has not decided is the '
              'worst version of this bug');
    });

    test('sent-for-review is a distinct outcome from could-not-verify', () {
      expect(VerificationOutcome.sentForReview,
          isNot(VerificationOutcome.couldNotVerify),
          reason: 'one says wait for notifications, the other says try another document');
    });

    test('a refusal carries the reason and the report', () {
      const r = VerificationResult(
        outcome: VerificationOutcome.couldNotVerify,
        problem: 'card_not_verified',
        report: {'front': 'unreadable'},
      );
      expect(r.isVerified, isFalse);
      expect(r.problem, 'card_not_verified');
      expect(r.report!['front'], 'unreadable');
    });
  });

  group('request', () {
    test('status maps to the three states the admin flow uses', () {
      expect(VerificationRequest.fromJson({'id': 1, 'status': 'pending'}).isPending, isTrue);
      expect(
          VerificationRequest.fromJson({'id': 1, 'status': 'approved'}).isApproved, isTrue);
      expect(
          VerificationRequest.fromJson({'id': 1, 'status': 'rejected'}).isRejected, isTrue);
    });

    test('a missing status defaults to pending, which is the safe reading', () {
      expect(VerificationRequest.fromJson({'id': 1}).isPending, isTrue,
          reason: 'assuming approved would grant access the server has not granted');
    });
  });
}
