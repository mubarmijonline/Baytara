// Profile: view and edit the fields the server actually lets a learner change.
//
// EDITABLE_PROFILE_FIELDS in backend/app/api/v1/auth.py is exactly
// {name, headline, location, bio}. Role, email and verification are deliberately absent
// server-side, so they are shown read-only rather than offered and then rejected.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/domain/session.dart';

class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  final _name = TextEditingController();
  bool _editing = false;
  bool _busy = false;
  String? _message;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save(AuthUser user) async {
    final l = L10n.of(context);
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      final dio = ref.read(apiClientProvider).raw;
      final res = await dio.patch<Map<String, dynamic>>(
        '/auth/profile',
        data: {'name': _name.text.trim()},
      );
      final updated = res.data?['user'];
      if (updated is Map) {
        ref.read(sessionProvider.notifier).signedIn(AuthUser(
              id: (updated['id'] as num).toInt(),
              name: updated['name'] as String? ?? '',
              email: updated['email'] as String? ?? '',
              phone: updated['phone'] as String?,
              role: updated['role'] as String? ?? 'student',
              isBaytarian: updated['is_baytarian'] as bool? ?? false,
              isVetStudent: updated['is_vet_student'] as bool? ?? false,
            ));
      }
      if (mounted) {
        setState(() {
          _editing = false;
          _message = l.profileSaved;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _message = asApiException(e).code.message(l));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final session = ref.watch(sessionProvider);
    if (session is! SessionSignedIn) {
      return Scaffold(appBar: AppBar(title: Text(l.profileTitle)));
    }
    final user = session.user;
    if (!_editing && _name.text != user.name) _name.text = user.name;

    return Scaffold(
      appBar: AppBar(
        title: Text(l.profileTitle),
        actions: [
          TextButton(
            onPressed: _busy
                ? null
                : () => _editing ? _save(user) : setState(() => _editing = true),
            child: Text(_editing ? l.profileSave : l.profileEdit,
                style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: CircleAvatar(
              radius: 40,
              backgroundColor: BrandColors.accentSoft,
              child: Text(
                user.name.isEmpty ? '?' : user.name.characters.first,
                style: const TextStyle(
                    fontSize: 30, fontWeight: FontWeight.w800,
                    color: BrandColors.accent),
              ),
            ),
          ),
          const SizedBox(height: 20),
          if (user.isBaytarian)
            Center(
              child: Chip(
                avatar: const Icon(Icons.verified, size: 16, color: Color(0xFF1A7F4B)),
                label: Text(user.isVetStudent
                    ? l.verifiedStudentTitle
                    : l.verifiedVetTitle),
              ),
            ),
          const SizedBox(height: 20),
          TextField(
            controller: _name,
            enabled: _editing,
            decoration: InputDecoration(labelText: l.profileName),
          ),
          const SizedBox(height: 14),
          // Read-only: the server does not accept changes to either, so offering a field
          // that silently ignores input would be worse than showing the value.
          _ReadOnly(label: l.authEmail, value: user.email, ltr: true),
          _ReadOnly(label: l.authPhone, value: user.phone ?? '', ltr: true),
          if (_message != null) ...[
            const SizedBox(height: 16),
            Text(_message!,
                style: const TextStyle(fontSize: 13.5, color: BrandColors.muted)),
          ],
        ],
      ),
    );
  }
}

class _ReadOnly extends StatelessWidget {
  const _ReadOnly({required this.label, required this.value, this.ltr = false});
  final String label;
  final String value;
  final bool ltr;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(fontSize: 12, color: BrandColors.muted2)),
            const SizedBox(height: 4),
            Text(value,
                textDirection: ltr ? TextDirection.ltr : null,
                style: const TextStyle(fontSize: 14.5)),
          ],
        ),
      );
}
