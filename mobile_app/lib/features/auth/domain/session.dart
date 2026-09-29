// What the app knows about who is signed in.
//
// Milestone 1 fills this from GET /auth/me. It exists now because the route guards are
// written against it, and guards are worth testing before there are screens to protect.
import 'package:flutter_riverpod/flutter_riverpod.dart';

class AuthUser {
  const AuthUser({
    required this.id,
    required this.name,
    required this.email,
    this.phone,
    this.role = 'student',
    this.isBaytarian = false,
    this.isVetStudent = false,
  });

  final int id;
  final String name;
  final String email;
  final String? phone;
  final String role;

  /// Verified veterinarian. Gates vet_free and baytarian content, and *excludes* the user
  /// from `general` (see backend/app/services/catalog_access.py:audience_error).
  final bool isBaytarian;

  /// Records which kind of vet. Gates nothing -- students and licensed doctors reach
  /// identical content.
  final bool isVetStudent;

  /// A phone number is mandatory before any video plays: it is burned into the watermark.
  /// Google sign-in does not supply one, which is why this is a whole route and not a field.
  bool get hasPhone => (phone ?? '').trim().isNotEmpty;
}

sealed class SessionState {
  const SessionState();
}

/// Still restoring tokens from secure storage. The router must not decide anything yet.
class SessionRestoring extends SessionState {
  const SessionRestoring();
}

class SessionSignedOut extends SessionState {
  const SessionSignedOut();
}

class SessionSignedIn extends SessionState {
  const SessionSignedIn(this.user);
  final AuthUser user;
}

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionRestoring();

  void signedIn(AuthUser user) => state = SessionSignedIn(user);
  void signedOut() => state = const SessionSignedOut();
  void restoredEmpty() => state = const SessionSignedOut();
}

final sessionProvider =
    NotifierProvider<SessionController, SessionState>(SessionController.new);
