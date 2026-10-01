// Closing the account from inside the app.
//
// App Store Guideline 5.1.1(v) requires it of any app that creates accounts, and Google
// Play asks for the same. What goes and what stays is the server's decision
// (backend/app/services/account_deletion.py); this screen says it, asks once, and asks for
// the password when the account has one. The website has the same page at
// /account/delete for anyone who no longer has the app.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/domain/session.dart';

const _danger = Color(0xFFB3261E);

class DeleteAccountScreen extends ConsumerStatefulWidget {
  const DeleteAccountScreen({super.key});

  @override
  ConsumerState<DeleteAccountScreen> createState() => _DeleteAccountScreenState();
}

class _DeleteAccountScreenState extends ConsumerState<DeleteAccountScreen> {
  final _password = TextEditingController();
  bool _agreed = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    super.dispose();
  }

  Future<void> _delete(bool needsPassword) async {
    final l = L10n.of(context);
    if (needsPassword && _password.text.isEmpty) {
      setState(() => _error = l.errWrongPassword);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(authControllerProvider).deleteAccount(
            password: needsPassword ? _password.text : null,
          );
      messenger.showSnackBar(SnackBar(content: Text(l.deleteAccountDone)));
      if (mounted) context.go('/');
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.code.message(l));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final session = ref.watch(sessionProvider);
    final user = session is SessionSignedIn ? session.user : null;
    final needsPassword = user?.hasPassword ?? true;

    Widget bullets(String title, List<String> items) => Padding(
          padding: const EdgeInsets.only(bottom: 18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title,
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.w800, color: BrandColors.ink)),
              const SizedBox(height: 8),
              for (final item in items)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('•  ', style: TextStyle(color: BrandColors.muted)),
                    Expanded(
                      child: Text(item,
                          style: const TextStyle(
                              fontSize: 14, height: 1.6, color: BrandColors.muted)),
                    ),
                  ]),
                ),
            ],
          ),
        );

    return Scaffold(
      appBar: AppBar(title: Text(l.deleteAccountTitle)),
      body: user == null
          ? const SizedBox.shrink()
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              children: [
                bullets(l.deleteAccountRemovedTitle, [
                  l.deleteAccountRemoved1,
                  l.deleteAccountRemoved2,
                  l.deleteAccountRemoved3,
                  l.deleteAccountRemoved4,
                ]),
                bullets(l.deleteAccountKeptTitle, [l.deleteAccountKept1]),
                Text(l.deleteAccountFinal,
                    style: const TextStyle(
                        fontSize: 14.5, height: 1.6, fontWeight: FontWeight.w700,
                        color: _danger)),
                const SizedBox(height: 16),
                if (needsPassword) ...[
                  TextField(
                    controller: _password,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    textDirection: TextDirection.ltr,
                    decoration: InputDecoration(labelText: l.deleteAccountPassword),
                  ),
                  const SizedBox(height: 8),
                ],
                CheckboxListTile(
                  value: _agreed,
                  onChanged: _busy ? null : (v) => setState(() => _agreed = v ?? false),
                  contentPadding: EdgeInsets.zero,
                  controlAffinity: ListTileControlAffinity.leading,
                  title: Text(l.deleteAccountConfirm, style: const TextStyle(fontSize: 14)),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4, bottom: 8),
                    child: Text(_error!, style: const TextStyle(color: _danger)),
                  ),
                const SizedBox(height: 8),
                FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: _danger),
                  onPressed: _agreed && !_busy ? () => _delete(needsPassword) : null,
                  child: Text(_busy ? l.deleteAccountWorking : l.deleteAccountSubmit),
                ),
              ],
            ),
    );
  }
}
