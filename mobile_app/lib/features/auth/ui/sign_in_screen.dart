// Sign in / create account, tabbed, matching the web's /auth page.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/validation/phone.dart';
import '../application/auth_controller.dart';
import '../data/auth_repository.dart';
import 'phone_field.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key, this.next});

  /// Where the user was going before the guard sent them here.
  final String? next;

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();

  String _dial = defaultDial;
  String _national = '';

  bool _busy = false;
  String? _error;

  /// Revealed by the eye toggle. Off by default: a password field is obscured because
  /// someone may be over your shoulder, and defaulting to visible would defeat that.
  bool _showPassword = false;

  @override
  void dispose() {
    _tabs.dispose();
    _email.dispose();
    _password.dispose();
    _name.dispose();
    super.dispose();
  }

  L10n get _l => L10n.of(context);

  /// Runs [action], turning every failure into one line of copy under the form.
  ///
  /// A device-limit refusal is not an error message -- it is a screen with the offending
  /// devices on it, so it navigates instead.
  Future<void> _run(Future<void> Function() action) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await action();
      ref.read(sessionEndedProvider.notifier).clear();
      if (mounted) context.go(widget.next ?? '/');
    } on DeviceLimitException catch (e) {
      if (mounted) {
        context.push('/auth/devices', extra: e.devices);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.code.message(_l));
    } catch (_) {
      if (mounted) setState(() => _error = _l.errUnknown);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _submitSignIn() {
    if (!isEmail(_email.text)) {
      setState(() => _error = _l.authEmailInvalid);
      return;
    }
    _run(() => ref.read(authControllerProvider).login(
          email: _email.text.trim(),
          password: _password.text,
        ));
  }

  void _submitSignUp() {
    if (_name.text.trim().isEmpty) {
      setState(() => _error = _l.authNameRequired);
      return;
    }
    if (!isEmail(_email.text)) {
      setState(() => _error = _l.authEmailInvalid);
      return;
    }
    if (_password.text.length < minPasswordLength) {
      setState(() => _error = _l.authPasswordTooShort);
      return;
    }
    final phone = composeMobile(_dial, _national);
    if (phone.isEmpty) {
      setState(() => _error = _l.phoneInvalid);
      return;
    }
    _run(() => ref.read(authControllerProvider).register(
          name: _name.text.trim(),
          email: _email.text.trim(),
          phone: phone,
          password: _password.text,
        ));
  }

  void _submitGoogle(String clientId) => _run(
        () => ref.read(authControllerProvider).signInWithGoogle(serverClientId: clientId),
      );

  @override
  Widget build(BuildContext context) {
    final l = _l;
    final googleClientId = ref.watch(googleClientIdProvider);

    // Why the user is looking at this screen, when they did not choose to be. The common
    // case is `device_not_registered`: the device was removed from another session, and
    // saying so is the difference between "sign in again" and an unexplained ejection.
    final endedReason = ref.watch(sessionEndedProvider);
    final endedMessage = switch (endedReason) {
      ApiErrorCode.deviceNotRegistered => l.sessionEndedDeviceRemoved,
      null => null,
      _ => null,
    };

    return Scaffold(
      appBar: AppBar(
        title: Text(l.authSignIn),
        // A guard redirect leaves no route to pop, so go_router shows no back arrow and the
        // user is stuck on sign-in. Browsing is open to anonymous visitors, so there is
        // always somewhere to go back to.
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          tooltip: l.commonCancel,
          onPressed: () =>
              context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (endedMessage != null)
              Container(
                width: double.infinity,
                margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: BrandColors.accentSoft,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: BrandColors.line),
                ),
                child: Text(
                  endedMessage,
                  style: const TextStyle(
                      fontSize: 13.5, height: 1.7, color: BrandColors.ink),
                ),
              ),
            TabBar(
              controller: _tabs,
              onTap: (_) => setState(() => _error = null),
              tabs: [Tab(text: l.authSignIn), Tab(text: l.authSignUp)],
            ),
            Expanded(
              child: TabBarView(
                controller: _tabs,
                children: [
                  _form(isSignUp: false),
                  _form(isSignUp: true),
                ],
              ),
            ),
            // Hidden entirely when the server reports no client id -- a button that cannot
            // work is worse than no button.
            googleClientId.maybeWhen(
              data: (id) => id.isEmpty
                  ? const SizedBox.shrink()
                  : Padding(
                      padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                      child: Column(
                        children: [
                          Row(children: [
                            const Expanded(child: Divider()),
                            Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 12),
                              child: Text(l.authOr,
                                  style: const TextStyle(color: BrandColors.muted2)),
                            ),
                            const Expanded(child: Divider()),
                          ]),
                          const SizedBox(height: 12),
                          OutlinedButton.icon(
                            onPressed: _busy ? null : () => _submitGoogle(id),
                            icon: const Icon(Icons.g_mobiledata, size: 28),
                            label: Text(l.authContinueWithGoogle),
                            style: OutlinedButton.styleFrom(
                              minimumSize:
                                  const Size(double.infinity, BrandLayout.minTouchTarget),
                            ),
                          ),
                        ],
                      ),
                    ),
              orElse: () => const SizedBox.shrink(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _form({required bool isSignUp}) {
    final l = _l;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        if (isSignUp) ...[
          TextField(
            controller: _name,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(labelText: l.authName),
          ),
          const SizedBox(height: 12),
        ],
        TextField(
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          textInputAction: TextInputAction.next,
          // The address is Latin whichever way the page is laid out.
          textDirection: TextDirection.ltr,
          decoration: InputDecoration(labelText: l.authEmail),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _password,
          obscureText: !_showPassword,
          textInputAction: isSignUp ? TextInputAction.next : TextInputAction.done,
          onSubmitted: (_) => isSignUp ? null : _submitSignIn(),
          decoration: InputDecoration(
            labelText: l.authPassword,
            // Typing a password blind on a phone keyboard is where most sign-in failures
            // come from, so it can be revealed deliberately.
            suffixIcon: IconButton(
              icon: Icon(_showPassword
                  ? Icons.visibility_off_outlined
                  : Icons.visibility_outlined),
              tooltip: _showPassword ? l.passwordHide : l.passwordShow,
              onPressed: () => setState(() => _showPassword = !_showPassword),
            ),
          ),
        ),
        if (isSignUp) ...[
          const SizedBox(height: 12),
          PhoneField(
            dial: _dial,
            national: _national,
            onChanged: (dial, national) => setState(() {
              _dial = dial;
              _national = national;
            }),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 14),
          Text(
            _error!,
            style: const TextStyle(color: Color(0xFFB3261E), fontSize: 13.5, height: 1.6),
          ),
        ],
        const SizedBox(height: 20),
        FilledButton(
          onPressed: _busy ? null : (isSignUp ? _submitSignUp : _submitSignIn),
          child: _busy
              ? const SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                )
              : Text(isSignUp ? l.authCreateAccount : l.authSignIn),
        ),
      ],
    );
  }
}
