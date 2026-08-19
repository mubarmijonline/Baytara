// Device management, in both the situations it is needed:
//
//   - as the answer to a 403 device_limit_reached during sign-in, seeded with the list the
//     refusal already carried, so the user is not made to wait for a second call to learn
//     what is in their way;
//   - as an ordinary account screen for a signed-in user.
//
// The account allowance is 2 (UserDevice.MAX_DEVICES), overridable per user, so the number
// is always read from the response rather than assumed.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';
import '../application/auth_controller.dart';
import '../data/auth_dto.dart';

class DevicesScreen extends ConsumerStatefulWidget {
  const DevicesScreen({super.key, this.initial, this.blocking = false});

  /// The list carried by a device-limit refusal, when we arrived from one.
  final DeviceList? initial;

  /// True when the user is *not* signed in and is here because sign-in was refused.
  /// Removing a device then means going back to try again, not staying on an account page.
  final bool blocking;

  @override
  ConsumerState<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends ConsumerState<DevicesScreen> {
  DeviceList? _list;
  String? _thisDeviceId;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _list = widget.initial;
    _resolveThisDevice();
    // Only fetch when we were not handed a list. A blocking arrival has no token, so
    // GET /auth/devices would 401.
    if (_list == null) _load();
  }

  Future<void> _resolveThisDevice() async {
    final id = await ref.read(deviceIdProvider).get();
    if (mounted) setState(() => _thisDeviceId = id);
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final list = await ref.read(authControllerProvider).devices();
      if (mounted) setState(() => _list = list);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.code.message(L10n.of(context)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(UserDevice device) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider).removeDevice(device.id);
      if (!mounted) return;
      setState(() {
        final remaining = [..._list!.devices]..removeWhere((d) => d.id == device.id);
        _list = DeviceList(devices: remaining, maxDevices: _list!.maxDevices);
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.code.message(L10n.of(context)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final list = _list;
    final locale = Localizations.localeOf(context).languageCode;
    final formatter = DateFormat.yMMMd(locale == 'en' ? 'en_US' : 'ar_EG').add_jm();

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.blocking ? l.devicesLimitTitle : l.devicesTitle),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            if (widget.blocking && list != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 18),
                child: Text(
                  l.devicesLimitBody(list.maxDevices),
                  style: const TextStyle(
                      fontSize: 14, height: 1.8, color: BrandColors.muted),
                ),
              ),
            if (list == null && _busy)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator()),
              ),
            if (list != null && list.devices.isEmpty)
              Text(l.devicesEmpty,
                  style: const TextStyle(color: BrandColors.muted2)),
            if (list != null)
              for (final device in list.devices)
                Card(
                  margin: const EdgeInsets.only(bottom: 10),
                  child: ListTile(
                    contentPadding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    title: Text(
                      device.deviceId == _thisDeviceId
                          ? l.devicesThisDevice
                          : (device.label?.trim().isNotEmpty ?? false)
                              ? device.label!
                              : device.deviceId,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
                    ),
                    subtitle: device.lastSeen == null
                        ? null
                        : Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              l.devicesLastSeen(formatter.format(device.lastSeen!.toLocal())),
                              style: const TextStyle(
                                  fontSize: 12.5, color: BrandColors.muted2),
                            ),
                          ),
                    trailing: TextButton(
                      onPressed: _busy ? null : () => _remove(device),
                      child: Text(l.devicesRemove),
                    ),
                  ),
                ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!,
                  style: const TextStyle(color: Color(0xFFB3261E), fontSize: 13.5)),
            ],
            if (widget.blocking) ...[
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : () => context.pop(),
                child: Text(l.devicesRetry),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
