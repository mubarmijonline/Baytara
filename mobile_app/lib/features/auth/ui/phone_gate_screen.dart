// The mandatory phone gate.
//
// Not a nicety and not a profile field: POST /video/playback refuses `phone_required`
// before it checks entitlement, because the number is burnt into the video watermark. A
// Google account arrives here with no phone every time -- Google does not supply one.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/validation/phone.dart';
import '../application/auth_controller.dart';
import 'phone_field.dart';

class PhoneGateScreen extends ConsumerStatefulWidget {
  const PhoneGateScreen({super.key, this.next});

  final String? next;

  @override
  ConsumerState<PhoneGateScreen> createState() => _PhoneGateScreenState();
}

class _PhoneGateScreenState extends ConsumerState<PhoneGateScreen> {
  String _dial = defaultDial;
  String _national = '';
  bool _busy = false;
  String? _error;

  Future<void> _save() async {
    final l = L10n.of(context);
    final e164 = composeMobile(_dial, _national);
    if (e164.isEmpty) {
      setState(() => _error = l.phoneInvalid);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider).submitPhone(e164);
      // The guard releases as soon as the session carries a phone; go where they meant to.
      if (mounted) context.go(widget.next ?? '/');
    } on ApiException catch (e) {
      if (!mounted) return;
      final field = e.fieldErrors['phone']?.first;
      setState(() => _error = field == 'phone_invalid' || field == 'phone_required'
          ? l.phoneInvalid
          : e.code.message(l));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l.phoneTitle),
        // Same as sign-in: reached by redirect, so nothing to pop. The gate still holds --
        // the guard sends the user straight back here the moment they try to play
        // anything -- but they can browse the catalogue in the meantime rather than being
        // trapped on a form.
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: l.commonCancel,
          onPressed: () =>
              context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(l.phoneBody,
                style: const TextStyle(
                    fontSize: 14, height: 1.8, color: BrandColors.muted)),
            const SizedBox(height: 22),
            PhoneField(
              dial: _dial,
              national: _national,
              autofocus: true,
              label: l.authPhone,
              onChanged: (dial, national) => setState(() {
                _dial = dial;
                _national = national;
              }),
            ),
            if (_error != null) ...[
              const SizedBox(height: 14),
              Text(_error!,
                  style: const TextStyle(
                      color: Color(0xFFB3261E), fontSize: 13.5, height: 1.6)),
            ],
            const SizedBox(height: 22),
            FilledButton(
              onPressed: _busy ? null : _save,
              child: _busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child:
                          CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                    )
                  : Text(l.phoneSave),
            ),
          ],
        ),
      ),
    );
  }
}
