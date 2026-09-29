// Device management, in both the situations it is needed:
//
//   - as the answer to a 403 device_limit_reached during sign-in, seeded with the list the
//     refusal already carried, so the user is not made to wait for a second call to learn
//     what is in their way;
//   - as an ordinary account screen for a signed-in user.
//
// The account allowance is 2 (UserDevice.MAX_DEVICES), overridable per user, so the number
// is always read from the response rather than assumed.
//
// The two situations are not the same screen with a different title, and the difference is
// what the rest of this file is about. **A device-limit refusal carries no token.**
// `_device_limit_response` in backend/app/api/v1/auth.py answers 403 with the machine list
// and nothing else, so from there `DELETE /auth/devices/<id>` is an anonymous call to a
// `@jwt_required` endpoint and can only ever fail. Offering "remove" on that screen was
// offering a button that 401s every time. It now explains what will actually work.
//
// Signed in, the full rule applies: one self-service change per window
// (backend/app/services/device_swaps.py), and once that is spent an admin has to agree --
// which is what the request form at the bottom is for.
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
  final TextEditingController _reason = TextEditingController();

  DeviceList? _list;
  String? _thisDeviceId;
  bool _busy = false;
  String? _error;

  /// True once the user has opened the ask-an-admin form. Also set by a refusal, so the
  /// form appears at the moment it becomes the only way forward rather than one tap later.
  bool _asking = false;

  @override
  void initState() {
    super.initState();
    _list = widget.initial;
    _resolveThisDevice();
    // Only fetch when we were not handed a list. A blocking arrival has no token, so
    // GET /auth/devices would 401.
    if (_list == null) _load();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
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
      final allowance = await ref.read(authControllerProvider).removeDevice(device.id);
      if (!mounted) return;
      setState(() {
        final remaining = [..._list!.devices]..removeWhere((d) => d.id == device.id);
        _list = _list!.copyWith(devices: remaining, allowance: allowance);
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.code.message(L10n.of(context));
        if (e.code == ApiErrorCode.deviceSwapLimitReached) {
          // The refusal spells the allowance differently from the list endpoint; see
          // SwapAllowance.fromRefusal.
          _list = _list?.copyWith(
              allowance: SwapAllowance.fromRefusal(e.data ?? const {}));
          _asking = true;
        }
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _askAdmin() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final request = await ref
          .read(authControllerProvider)
          .requestDeviceSwap(reason: _reason.text.trim());
      if (!mounted) return;
      setState(() {
        _list = _list?.copyWith(swapRequest: request);
        _asking = false;
        _reason.clear();
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.code.message(L10n.of(context));
        // 409: they can still do it themselves. Close the form rather than leaving them
        // filling in a reason nobody needs to read.
        if (e.code == ApiErrorCode.swapStillAvailable) _asking = false;
      });
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
    final dayOnly = DateFormat.yMMMd(locale == 'en' ? 'en_US' : 'ar_EG');

    final allowance = list?.allowance;
    final pending = list?.swapRequest;
    // Removal is a signed-in action. On the blocking screen there is no token to make it
    // with, so the button is not offered at all.
    final canRemove = !widget.blocking;

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

            // What the account has left, and when the window turns over. Only on the
            // signed-in read: the refusal body does not carry it.
            if (!widget.blocking && allowance != null) ...[
              Text(
                l.devicesSwapsLeft(allowance.used, allowance.allowed),
                style: const TextStyle(
                    fontSize: 13.5, height: 1.8, color: BrandColors.muted),
              ),
              if (allowance.resetsAt != null)
                Text(
                  l.devicesSwapResets(dayOnly.format(allowance.resetsAt!.toLocal())),
                  style: const TextStyle(
                      fontSize: 12.5, color: BrandColors.muted2, height: 1.7),
                ),
              const SizedBox(height: 14),
            ],

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
                    trailing: canRemove
                        ? TextButton(
                            onPressed: _busy ? null : () => _remove(device),
                            child: Text(l.devicesRemove),
                          )
                        : null,
                  ),
                ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!,
                  style: const TextStyle(color: Color(0xFFB3261E), fontSize: 13.5)),
            ],

            // Asking an admin. Reachable only with a token, so never on the blocking
            // screen -- POST /auth/devices/swap-requests is @jwt_required like the delete.
            if (!widget.blocking && list != null) ...[
              if (pending?.isPending ?? false)
                _Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.devicesResetPending,
                          style: const TextStyle(
                              fontSize: 13.5, height: 1.9, color: BrandColors.ink2)),
                      if (pending!.createdAt != null) ...[
                        const SizedBox(height: 6),
                        Text(
                          l.devicesResetSentAt(
                              dayOnly.format(pending.createdAt!.toLocal())),
                          style: const TextStyle(
                              fontSize: 12.5, color: BrandColors.muted2),
                        ),
                      ],
                    ],
                  ),
                )
              else if (_asking || (allowance?.exhausted ?? false))
                _Panel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.devicesSwapSpentTitle,
                          style: const TextStyle(
                              fontSize: 15, fontWeight: FontWeight.w800)),
                      const SizedBox(height: 8),
                      Text(l.devicesSwapSpentBody,
                          style: const TextStyle(
                              fontSize: 13.5, height: 1.9, color: BrandColors.muted)),
                      const SizedBox(height: 14),
                      TextField(
                        controller: _reason,
                        maxLines: 3,
                        maxLength: 500,
                        decoration: InputDecoration(
                          labelText: l.devicesResetReason,
                          border: const OutlineInputBorder(),
                        ),
                      ),
                      const SizedBox(height: 4),
                      FilledButton(
                        onPressed: _busy ? null : _askAdmin,
                        child: Text(l.devicesResetSubmit),
                      ),
                    ],
                  ),
                ),
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

class _Panel extends StatelessWidget {
  const _Panel({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 18),
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: BrandColors.surfaceAlt,
          borderRadius: BorderRadius.circular(14),
        ),
        child: child,
      );
}
