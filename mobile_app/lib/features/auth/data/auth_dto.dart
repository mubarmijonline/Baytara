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

/// The subset of the profile worth caching for an instant cold start. Only what the route
/// guards and the greeting need; anything else is re-read from the server anyway.
Map<String, dynamic> authUserToJson(AuthUser u) => {
      'id': u.id,
      'name': u.name,
      'email': u.email,
      'phone': u.phone,
      'role': u.role,
      'is_baytarian': u.isBaytarian,
      'is_vet_student': u.isVetStudent,
    };

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

/// How many times this account may still free a device slot on its own.
///
/// Two devices is the cap; this is about changing *which* two. The client's rule
/// (2026-09-19, backend/app/services/device_swaps.py): one self-service swap per window,
/// so someone who buys a new phone is covered without asking anyone, and someone cycling a
/// third, fourth and fifth machine through one account is not. Beyond that an admin
/// decides.
///
/// [resetsAt] is null when the window has not opened -- nothing has been swapped yet, so
/// there is no clock to report, and saying "resets on ..." would invent one.
class SwapAllowance {
  const SwapAllowance({this.used = 0, this.allowed = 1, this.resetsAt});

  factory SwapAllowance.fromJson(Map<String, dynamic> json) => SwapAllowance(
        used: (json['swaps_used'] as num?)?.toInt() ?? 0,
        // Not hardcoded to one: an admin approval raises it for the current window.
        allowed: (json['swaps_allowed'] as num?)?.toInt() ?? 1,
        resetsAt: DateTime.tryParse(json['swaps_reset_at'] as String? ?? ''),
      );

  /// The same three numbers as they appear in a 403 `device_swap_limit_reached` body,
  /// where they are named `used` / `allowed` / `resets_at` rather than `swaps_*`. Two
  /// spellings for one fact is not something to paper over silently: parsing the refusal
  /// with [SwapAllowance.fromJson] yields 0 of 1 and tells the user the opposite of the
  /// truth at the exact moment they are blocked.
  factory SwapAllowance.fromRefusal(Map<String, dynamic> json) => SwapAllowance(
        used: (json['used'] as num?)?.toInt() ?? 1,
        allowed: (json['allowed'] as num?)?.toInt() ?? 1,
        resetsAt: DateTime.tryParse(json['resets_at'] as String? ?? ''),
      );

  final int used;
  final int allowed;
  final DateTime? resetsAt;

  bool get exhausted => used >= allowed;
}

/// A pending ask for an admin to free a slot, from `swap_request` on GET /auth/devices or
/// the body of POST /auth/devices/swap-requests.
class DeviceSwapRequest {
  const DeviceSwapRequest({
    required this.id,
    required this.status,
    this.reason,
    this.createdAt,
  });

  factory DeviceSwapRequest.fromJson(Map<String, dynamic> json) => DeviceSwapRequest(
        id: (json['id'] as num?)?.toInt() ?? 0,
        status: json['status'] as String? ?? 'pending',
        reason: json['reason'] as String?,
        createdAt: DateTime.tryParse(json['created_at'] as String? ?? ''),
      );

  final int id;
  final String status;
  final String? reason;
  final DateTime? createdAt;

  bool get isPending => status == 'pending';
}

/// GET /auth/devices, and also the body of a 403 device_limit_reached.
///
/// The refusal carries only the list and the cap; the allowance fields are on the signed-in
/// read. That is why they default rather than being required -- a blocked sign-in has no
/// token, so it cannot know how many swaps the account has left.
class DeviceList {
  const DeviceList({
    required this.devices,
    required this.maxDevices,
    this.allowance = const SwapAllowance(),
    this.swapRequest,
  });

  factory DeviceList.fromJson(Map<String, dynamic> json) => DeviceList(
        devices: [
          for (final d in (json['devices'] as List? ?? const []))
            UserDevice.fromJson(d as Map<String, dynamic>),
        ],
        maxDevices: (json['max_devices'] as num?)?.toInt() ?? 2,
        allowance: SwapAllowance.fromJson(json),
        swapRequest: json['swap_request'] is Map<String, dynamic>
            ? DeviceSwapRequest.fromJson(json['swap_request'] as Map<String, dynamic>)
            : null,
      );

  final List<UserDevice> devices;
  final int maxDevices;
  final SwapAllowance allowance;
  final DeviceSwapRequest? swapRequest;

  DeviceList copyWith({
    List<UserDevice>? devices,
    SwapAllowance? allowance,
    DeviceSwapRequest? swapRequest,
  }) =>
      DeviceList(
        devices: devices ?? this.devices,
        maxDevices: maxDevices,
        allowance: allowance ?? this.allowance,
        swapRequest: swapRequest ?? this.swapRequest,
      );
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
