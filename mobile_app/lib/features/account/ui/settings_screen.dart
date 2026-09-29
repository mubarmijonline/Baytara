// Settings: language, account links, the legal pages, and signing out.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/links/app_link.dart';
import '../../../core/i18n/locale_controller.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/application/auth_controller.dart';
import '../../auth/domain/session.dart';

final _versionProvider = FutureProvider<String>((ref) async {
  final info = await PackageInfo.fromPlatform();
  return '${info.version} (${info.buildNumber})';
});

/// Opens a page of the website in the browser, resolved against the same origin the app
/// talks to, so a staging build does not send someone to the live terms.
Future<void> _openOnSite(String path) async {
  final uri = Uri.parse('$siteOrigin$path');
  if (await canLaunchUrl(uri)) {
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }
}

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final locale = ref.watch(localeProvider);
    final session = ref.watch(sessionProvider);
    final version = ref.watch(_versionProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.settingsTitle)),
      body: ListView(
        children: [
          const SizedBox(height: 8),
          _SectionLabel(l.settingsLanguage),
          RadioGroup<String>(
            groupValue: locale.languageCode,
            onChanged: (code) => code == null
                ? null
                : ref.read(localeProvider.notifier).set(Locale(code)),
            child: Column(children: [
              // Both labels are written in their own script, so neither is only legible to
              // someone who already reads the other.
              RadioListTile<String>(value: 'ar', title: Text(l.settingsArabic)),
              RadioListTile<String>(value: 'en', title: Text(l.settingsEnglish)),
            ]),
          ),
          if (session is SessionSignedIn) ...[
            const Divider(height: 24),
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(l.profileTitle),
              onTap: () => context.push('/account/profile'),
            ),
            ListTile(
              leading: const Icon(Icons.devices_other),
              title: Text(l.settingsDevices),
              onTap: () => context.push('/account/devices'),
            ),
            ListTile(
              leading: const Icon(Icons.payments_outlined),
              title: Text(l.settingsPayments),
              onTap: () => context.push('/account/payments'),
            ),
            ListTile(
              leading: const Icon(Icons.notifications_none),
              title: Text(l.notificationsTitle),
              onTap: () => context.push('/account/notifications'),
            ),
          ],
          const Divider(height: 24),
          ListTile(
            leading: const Icon(Icons.menu_book_outlined),
            title: Text(l.libraryTitle),
            onTap: () => context.push('/library'),
          ),
          // Terms, refund and delivery open on the website. Not a purchase link, so
          // Guideline 3.1.1 has nothing to say about them, and one copy of a legal
          // document is the only number of copies worth having.
          ListTile(
            leading: const Icon(Icons.gavel_outlined),
            title: Text(l.settingsTerms),
            onTap: () => _openOnSite('/terms'),
          ),
          ListTile(
            leading: const Icon(Icons.assignment_return_outlined),
            title: Text(l.settingsRefund),
            onTap: () => _openOnSite('/refund'),
          ),
          ListTile(
            leading: const Icon(Icons.local_shipping_outlined),
            title: Text(l.settingsDelivery),
            onTap: () => _openOnSite('/delivery'),
          ),
          ListTile(
            leading: const Icon(Icons.info_outline),
            title: Text(l.settingsAbout),
            onTap: () => context.push('/about'),
          ),
          ListTile(
            leading: const Icon(Icons.privacy_tip_outlined),
            title: Text(l.settingsPrivacy),
            // In-app now, but still the website's own page rather than a copied one: a
            // second privacy policy that drifts from the real one is worse than a link.
            onTap: () => context.push('/privacy'),
          ),
          ListTile(
            leading: const Icon(Icons.mail_outline),
            title: Text(l.settingsContact),
            onTap: () => context.push('/contact'),
          ),
          if (session is SessionSignedIn) ...[
            const Divider(height: 24),
            ListTile(
              leading: const Icon(Icons.logout, color: Color(0xFFB3261E)),
              title: Text(l.signOut,
                  style: const TextStyle(color: Color(0xFFB3261E))),
              onTap: () => _confirmSignOut(context, ref),
            ),
          ],
          const SizedBox(height: 20),
          version.maybeWhen(
            data: (v) => Center(
              child: Padding(
                padding: const EdgeInsets.only(bottom: 24),
                child: Text('${l.settingsVersion} $v',
                    style: const TextStyle(
                        fontSize: 12, color: BrandColors.muted2)),
              ),
            ),
            orElse: () => const SizedBox(height: 24),
          ),
        ],
      ),
    );
  }


  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final l = L10n.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        content: Text(l.signOutConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(l.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(l.signOut,
                style: const TextStyle(color: Color(0xFFB3261E))),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    // Frees this device's slot server-side, which is the difference between signing out and
    // just dropping the tokens.
    await ref.read(authControllerProvider).signOut();
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsetsDirectional.only(start: 20, top: 8, bottom: 4),
        child: Align(
          alignment: AlignmentDirectional.centerStart,
          child: Text(text,
              style: const TextStyle(
                  fontSize: 12.5, fontWeight: FontWeight.w700,
                  color: BrandColors.muted2)),
        ),
      );
}
