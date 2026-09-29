// ignore_for_file: prefer_initializing_formals
// The device id.
//
// The server allows two devices per account and keys them on this value. It is generated
// once on first launch and then never changes for the life of the install. A fresh id
// silently consumes one of the user's two slots and they cannot get it back without
// visiting the devices screen, so every path through this file must be read as: does this
// ever produce a second id for the same install?
//
// It is sent two ways, and the server cross-checks them:
//   - as `device_id` in the JSON body of /auth/register, /auth/login, /auth/google, /auth/logout
//   - as the X-Baytara-Device-ID header on everything else
// The value is also a claim in the JWT. /video/playback rejects any request whose header
// disagrees with the claim (`device_mismatch`).
import 'dart:async';

import 'package:uuid/uuid.dart';

import 'secure_store.dart';

class DeviceIdProvider {
  DeviceIdProvider(this._store, {Uuid uuid = const Uuid()}) : _uuid = uuid;

  final SecureStore _store;
  final Uuid _uuid;

  String? _cached;
  Future<String>? _inFlight;

  /// The stable id for this install, creating it on first call.
  ///
  /// Concurrent callers share one future. Two racing calls that each generated and wrote
  /// a UUID would leave the store holding the loser's value while the winner's was already
  /// in a JWT, which presents to the user as an unexplained `device_mismatch`.
  Future<String> get() {
    final cached = _cached;
    if (cached != null) return Future.value(cached);
    return _inFlight ??= _resolve().whenComplete(() => _inFlight = null);
  }

  Future<String> _resolve() async {
    final existing = await _store.deviceId;
    if (existing != null && existing.isNotEmpty) {
      return _cached = existing;
    }
    final created = _uuid.v4();
    await _store.setDeviceId(created);
    return _cached = created;
  }
}
