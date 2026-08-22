// About, Contact and Privacy, in the app rather than bounced to the browser.
//
// About and Contact come from the same CMS blocks the website reads, so editing them in the
// admin panel updates both. Privacy is different and is handled honestly below.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/branded_title.dart';
import '../../../core/theme/tokens.dart';
import '../../catalogue/application/catalogue_providers.dart';
import '../../catalogue/data/site_settings.dart';
import '../data/privacy_doc.dart';

class AboutScreen extends ConsumerWidget {
  const AboutScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(settingsProvider);

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(l.settingsAbout)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Error(message: asApiException(e).code.message(l)),
        data: (s) {
          final about = s.about;
          if (about.isEmpty) return _Empty(text: l.businessEmpty);

          return ListView(
            padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
            children: [
              Center(child: Image.asset('assets/brand/icon.png', height: 56)),
              const SizedBox(height: 22),
              if (about.title.isNotEmpty)
                Text(about.title,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w800, height: 1.5)),
              if (about.body.isNotEmpty) ...[
                const SizedBox(height: 14),
                Text(about.body,
                    style: const TextStyle(
                        fontSize: 14.5, height: 2.0, color: BrandColors.ink2)),
              ],
              if (about.values.isNotEmpty) ...[
                const SizedBox(height: 28),
                for (final v in about.values)
                  Card(
                    margin: const EdgeInsets.only(bottom: 12),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(v.title,
                              style: const TextStyle(
                                  fontSize: 15, fontWeight: FontWeight.w700)),
                          if (v.description.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text(v.description,
                                style: const TextStyle(
                                    fontSize: 13.5,
                                    height: 1.85,
                                    color: BrandColors.muted)),
                          ],
                        ],
                      ),
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }
}

/// Contact details plus the message form, posting to the same endpoint the website uses.
class ContactScreen extends ConsumerStatefulWidget {
  const ContactScreen({super.key});

  @override
  ConsumerState<ContactScreen> createState() => _ContactScreenState();
}

class _ContactScreenState extends ConsumerState<ContactScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _message = TextEditingController();

  bool _busy = false;
  String? _feedback;
  bool _sent = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final l = L10n.of(context);
    if (_name.text.trim().isEmpty ||
        _email.text.trim().isEmpty ||
        _message.text.trim().isEmpty) {
      setState(() => _feedback = l.contactFillAll);
      return;
    }
    setState(() {
      _busy = true;
      _feedback = null;
    });
    try {
      await ref.read(catalogueRepositoryProvider).contact(
            name: _name.text.trim(),
            email: _email.text.trim(),
            body: _message.text.trim(),
          );
      if (mounted) {
        setState(() {
          _sent = true;
          _feedback = l.contactSent;
        });
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _feedback = e.code.message(l));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final contact = ref.watch(settingsProvider).value?.contact ?? const ContactCopy();

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(l.settingsContact)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          if (contact.title.isNotEmpty)
            Text(contact.title,
                style: const TextStyle(
                    fontSize: 19, fontWeight: FontWeight.w800, height: 1.5)),
          if (contact.subtitle.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(contact.subtitle,
                style: const TextStyle(
                    fontSize: 13.5, height: 1.9, color: BrandColors.muted)),
          ],
          const SizedBox(height: 18),
          // Several of these are blank in the CMS; each row hides rather than showing an
          // empty label next to an icon.
          if (contact.email.isNotEmpty)
            _ContactRow(
              icon: Icons.mail_outline,
              value: contact.email,
              onTap: () => _open('mailto:${contact.email}'),
            ),
          if (contact.phone.isNotEmpty)
            _ContactRow(
              icon: Icons.phone_outlined,
              value: contact.phone,
              onTap: () => _open('tel:${contact.phone}'),
            ),
          if (contact.address.isNotEmpty)
            _ContactRow(icon: Icons.place_outlined, value: contact.address),
          if (contact.hours.isNotEmpty)
            _ContactRow(icon: Icons.schedule, value: contact.hours),
          const SizedBox(height: 26),
          if (!_sent) ...[
            TextField(
              controller: _name,
              decoration: InputDecoration(labelText: l.authName),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              textDirection: TextDirection.ltr,
              decoration: InputDecoration(labelText: l.authEmail),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _message,
              maxLines: 5,
              decoration: InputDecoration(labelText: l.contactMessage),
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: _busy ? null : _send,
              child: _busy
                  ? const SizedBox(
                      height: 18,
                      width: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : Text(l.contactSend),
            ),
          ],
          if (_feedback != null) ...[
            const SizedBox(height: 16),
            Text(_feedback!,
                style: TextStyle(
                    fontSize: 13.5,
                    height: 1.7,
                    color: _sent ? const Color(0xFF1A7F4B) : BrandColors.muted)),
          ],
        ],
      ),
    );
  }

  Future<void> _open(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }
}

class _ContactRow extends StatelessWidget {
  const _ContactRow({required this.icon, required this.value, this.onTap});

  final IconData icon;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(children: [
            Icon(icon, size: 18, color: BrandColors.accent),
            const SizedBox(width: 12),
            Expanded(
              child: Text(value,
                  style: TextStyle(
                      fontSize: 14,
                      color: onTap != null ? BrandColors.accent : BrandColors.ink2)),
            ),
          ]),
        ),
      );
}

/// The privacy policy, rendered natively from the ported document.
///
/// See privacy_doc.dart: the text is a second copy of the website's, so the two must be
/// edited together until the policy moves into the settings CMS.
class PrivacyScreen extends StatelessWidget {
  const PrivacyScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final code = Localizations.localeOf(context).languageCode;
    final sections = PrivacyDoc.forLocale(code);

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(l.settingsPrivacy)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          Text(l.settingsPrivacy,
              style: const TextStyle(
                  fontSize: 21, fontWeight: FontWeight.w800, height: 1.5)),
          const SizedBox(height: 6),
          // A policy without a date is not much of a policy.
          Text(l.privacyUpdated(PrivacyDoc.updatedFor(code)),
              style: const TextStyle(fontSize: 12.5, color: BrandColors.muted2)),
          const SizedBox(height: 24),
          for (final section in sections) ...[
            Text(section.title,
                style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w800,
                    height: 1.5,
                    color: BrandColors.ink)),
            const SizedBox(height: 8),
            for (final paragraph in section.body) ...[
              Text(paragraph,
                  style: const TextStyle(
                      fontSize: 14, height: 2.0, color: BrandColors.ink2)),
              const SizedBox(height: 10),
            ],
            for (final item in section.items)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Padding(
                      padding: EdgeInsets.only(top: 8),
                      child: Icon(Icons.circle, size: 5, color: BrandColors.accent),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(item,
                          style: const TextStyle(
                              fontSize: 13.5, height: 1.95, color: BrandColors.ink2)),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 20),
          ],
        ],
      ),
    );
  }
}

class _Error extends StatelessWidget {
  const _Error({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: BrandColors.muted, height: 1.8)),
        ),
      );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(text,
              textAlign: TextAlign.center,
              style: const TextStyle(color: BrandColors.muted2, height: 1.8)),
        ),
      );
}
