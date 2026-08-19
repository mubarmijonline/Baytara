// Wire shapes for the auth endpoints, matching backend/app/api/v1/auth.py exactly.
import '../domain/session.dart';

/// Built from `_user_json` in the backend. Fields the app does not use yet (specialties,
/// vet card details, avatar/cover) are left off until the screen that needs them exists --
/// a DTO that mirrors every column is a DTO nobody keeps in sync.
AuthUser authUserFromJson(Map<String, dynamic> json) => AuthUser(
      id: (json['id'] as num).toInt(),
      name: json['name'] as String? ?? '',
      email: json['email'] as String? ?? '',
      phone: json['phone'] as String?,
      role: json['role'] as String? ?? 'student',
      isBaytarian: json['is_baytarian'] as bool? ?? false,
      isVetStudent: json['is_vet_student'] as bool? ?? false,
    );

/// One row of GET /auth/devices.
class UserDevice {
  const UserDevice({
    required this.id,
    required this.deviceId,
    this.label,
    this.createdAt,
    this.lastSeen,
  });

  factory UserDevice.fromJson(Map<String, dynamic> json) => UserDevice(
        id: (json['id'] as num).toInt(),
        deviceId: json['device_id'] as String? ?? '',
        label: json['label'] as String?,
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
        lastSeen: DateTime.tryParse(json['last_seen'] as String? ?? ''),
      );

  final int id;
  final String deviceId;

  /// A User-Agent snippet the server stored so the person can recognise the device.
  final String? label;
  final DateTime? createdAt;
  final DateTime? lastSeen;
}

/// GET /auth/devices, and also the body of a 403 device_limit_reached.
class DeviceList {
  const DeviceList({required this.devices, required this.maxDevices});

  factory DeviceList.fromJson(Map<String, dynamic> json) => DeviceList(
        devices: [
          for (final d in (json['devices'] as List? ?? const []))
            UserDevice.fromJson(d as Map<String, dynamic>),
        ],
        maxDevices: (json['max_devices'] as num?)?.toInt() ?? 2,
      );

  final List<UserDevice> devices;
  final int maxDevices;
}

/// A successful sign-in, register or Google exchange.
class AuthResult {
  const AuthResult({
    required this.user,
    required this.accessToken,
    required this.refreshToken,
    this.needsPhone = false,
  });

  factory AuthResult.fromJson(Map<String, dynamic> json) {
    final user = authUserFromJson(json['user'] as Map<String, dynamic>);
    return AuthResult(
      user: user,
      accessToken: json['access_token'] as String,
      refreshToken: json['refresh_token'] as String,
      // Only /auth/google sends this. Falling back to the user's own phone means the
      // other two endpoints reach the same answer without a special case.
      needsPhone: json['needs_phone'] as bool? ?? !user.hasPhone,
    );
  }

  final AuthUser user;
  final String accessToken;
  final String refreshToken;
  final bool needsPhone;
}
