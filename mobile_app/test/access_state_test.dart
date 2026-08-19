// The four access tiers and the phone gate, as the UI must present them.
//
// The rule being protected here: `general` is the paid tier for people who are NOT
// veterinarians, and a verified vet is refused it. It is the one tier that reads backwards,
// and getting it wrong shows a vet a Buy button for something the server will never sell
// them (backend/app/services/catalog_access.py:audience_error).
import 'package:baytara/core/access/access.dart';
import 'package:baytara/features/auth/domain/session.dart';
import 'package:flutter_test/flutter_test.dart';

const _anonymous = SessionSignedOut();

const _plainUser = SessionSignedIn(
  AuthUser(id: 1, name: 'A', email: 'a@b.c', phone: '+201024527770'),
);
const _userNoPhone = SessionSignedIn(AuthUser(id: 2, name: 'B', email: 'b@b.c'));
const _vet = SessionSignedIn(
  AuthUser(id: 3, name: 'C', email: 'c@b.c', phone: '+201024527770', isBaytarian: true),
);
const _vetStudent = SessionSignedIn(
  AuthUser(
    id: 4,
    name: 'D',
    email: 'd@b.c',
    phone: '+201024527770',
    isBaytarian: true,
    isVetStudent: true,
  ),
);

AccessState _resolve(
  SessionState session,
  AccessTier tier, {
  String? serverLockReason,
  bool? canPlay,
  bool entitled = false,
}) =>
    AccessState.resolve(
      session: session,
      tier: tier,
      serverLockReason: serverLockReason,
      canPlay: canPlay,
      entitled: entitled,
    );

void main() {
  group('signed out', () {
    test('every tier asks for an account first, free included', () {
      for (final tier in AccessTier.values) {
        expect(_resolve(_anonymous, tier).reason, LockReason.needsAccount,
            reason: tier.wire);
      }
    });
  });

  group('free', () {
    test('open to anyone with an account', () {
      expect(_resolve(_plainUser, AccessTier.free).isOpen, isTrue);
      expect(_resolve(_vet, AccessTier.free).isOpen, isTrue);
    });
  });

  group('vet_free', () {
    test('costs nothing but is still vets only', () {
      expect(_resolve(_plainUser, AccessTier.vetFree).reason, LockReason.needsBaytarian);
      expect(_resolve(_vet, AccessTier.vetFree).isOpen, isTrue);
    });

    test('never asks for payment', () {
      expect(_resolve(_plainUser, AccessTier.vetFree).reason,
          isNot(LockReason.needsPurchase));
    });
  });

  group('baytarian', () {
    test('a non-vet is told to verify, not to pay', () {
      expect(_resolve(_plainUser, AccessTier.baytarian).reason,
          LockReason.needsBaytarian,
          reason: 'the audience rule is checked before the price, as on the server');
    });

    test('a verified vet who has not bought it is asked to pay', () {
      expect(_resolve(_vet, AccessTier.baytarian).reason, LockReason.needsPurchase);
    });

    test('an entitled vet gets in', () {
      expect(_resolve(_vet, AccessTier.baytarian, entitled: true).isOpen, isTrue);
    });
  });

  group('general, the tier that reads backwards', () {
    test('a verified vet is refused it outright', () {
      expect(_resolve(_vet, AccessTier.general).reason,
          LockReason.nonVeterinariansOnly);
    });

    test('a vet is never shown a Buy button for it', () {
      expect(_resolve(_vet, AccessTier.general).reason, isNot(LockReason.needsPurchase));
      expect(_resolve(_vet, AccessTier.general, entitled: true).reason,
          LockReason.nonVeterinariansOnly,
          reason: 'even a stale entitlement cannot open a tier the audience rule bars');
    });

    test('a non-vet is asked to pay', () {
      expect(_resolve(_plainUser, AccessTier.general).reason, LockReason.needsPurchase);
    });
  });

  group('vet students', () {
    test('reach exactly what licensed vets reach', () {
      for (final tier in AccessTier.values) {
        expect(_resolve(_vetStudent, tier).reason, _resolve(_vet, tier).reason,
            reason: 'is_vet_student records which kind of vet and gates nothing (${tier.wire})');
      }
    });
  });

  group('the phone gate', () {
    test('blocks free content, which nothing else does', () {
      expect(_resolve(_userNoPhone, AccessTier.free).reason, LockReason.needsPhone);
    });

    test('a tier refusal is reported ahead of the missing phone', () {
      // Telling someone to add a phone number for content they could never watch is
      // a wasted step; the tier problem is the one they can act on.
      expect(_resolve(_userNoPhone, AccessTier.vetFree).reason,
          LockReason.needsBaytarian);
    });
  });

  group('the server has the last word', () {
    test('can_play true opens the card whatever we would have derived', () {
      // e.g. an instructor on their own course, or an admin: both bypass the tier rules
      // server-side, and no client-side derivation could know that.
      expect(_resolve(_plainUser, AccessTier.baytarian, canPlay: true).isOpen, isTrue);
      expect(_resolve(_vet, AccessTier.general, canPlay: true).isOpen, isTrue);
      expect(_resolve(_userNoPhone, AccessTier.free, canPlay: true).isOpen, isTrue);
    });

    test('a server lock_reason is trusted over the local rule', () {
      // is_baytarian can change server-side between loading the session and rendering.
      expect(
        _resolve(_vet, AccessTier.baytarian, serverLockReason: 'needs_baytarian').reason,
        LockReason.needsBaytarian,
      );
      expect(
        _resolve(_plainUser, AccessTier.free,
                serverLockReason: 'non_veterinarians_only')
            .reason,
        LockReason.nonVeterinariansOnly,
      );
    });
  });

  group('tier parsing', () {
    test('wire values round-trip and unknown falls back to the paid default', () {
      expect(AccessTier.fromWire('free'), AccessTier.free);
      expect(AccessTier.fromWire('vet_free'), AccessTier.vetFree);
      expect(AccessTier.fromWire('baytarian'), AccessTier.baytarian);
      expect(AccessTier.fromWire('general'), AccessTier.general);
      expect(AccessTier.fromWire(null), AccessTier.general,
          reason: 'defaulting to a paid tier fails closed, not open');
      expect(AccessTier.fromWire('something_new'), AccessTier.general);
    });

    test('only baytarian and general cost money', () {
      expect(AccessTier.free.isPaid, isFalse);
      expect(AccessTier.vetFree.isPaid, isFalse);
      expect(AccessTier.baytarian.isPaid, isTrue);
      expect(AccessTier.general.isPaid, isTrue);
    });
  });
}
