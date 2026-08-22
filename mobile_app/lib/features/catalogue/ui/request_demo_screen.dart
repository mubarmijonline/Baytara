// Request a demo, for the B2B flow.
//
// Worth knowing: the website's own "اطلب عرضاً تجريبياً" and "تحدث مع مختص" buttons on
// /business have **no click handler** -- they are styled and inert. So there was no existing
// flow to mirror and no destination it already sent to.
//
// The only enquiry inbox that exists is POST /contact -> ContactMessage, which the admin
// panel reads under Messages. That is where a demo request belongs, so this posts there with
// a subject line that lets an admin tell it apart from a general enquiry at a glance.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/theme/branded_title.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/validation/phone.dart';
import '../../auth/domain/session.dart';
import '../application/catalogue_providers.dart';

/// Which of the two B2B calls to action was pressed. Both land in the same inbox; only the
/// subject and the intro line differ, so an admin can triage them.
enum DemoRequestKind { demo, specialist }

class RequestDemoScreen extends ConsumerStatefulWidget {
  const RequestDemoScreen({super.key, this.kind = DemoRequestKind.demo});
  final DemoRequestKind kind;

  @override
  ConsumerState<RequestDemoScreen> createState() => _RequestDemoScreenState();
}

class _RequestDemoScreenState extends ConsumerState<RequestDemoScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _organisation = TextEditingController();
  final _phone = TextEditingController();
  final _notes = TextEditingController();

  /// Rough team size. A range is enough to route the enquiry and is far easier to answer
  /// than an exact headcount.
  String _teamSize = '1-10';
  static const _sizes = ['1-10', '11-50', '51-200', '200+'];

  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Prefill from the signed-in account. Retyping details the app already holds is the
    // fastest way to lose someone on a form.
    final session = ref.read(sessionProvider);
    if (session is SessionSignedIn) {
      _name.text = session.user.name;
      _email.text = session.user.email;
      _phone.text = session.user.phone ?? '';
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _organisation.dispose();
    _phone.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final l = L10n.of(context);
    if (_name.text.trim().isEmpty || _organisation.text.trim().isEmpty) {
      setState(() => _error = l.contactFillAll);
      return;
    }
    if (!isEmail(_email.text)) {
      setState(() => _error = l.authEmailInvalid);
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    final isDemo = widget.kind == DemoRequestKind.demo;
    // The inbox stores a single body, so the structured answers are composed into it in a
    // fixed order. An admin reading this needs the organisation and the size first.
    final body = [
      isDemo ? l.demoBodyIntro : l.demoBodyIntroSpecialist,
      '',
      '${l.demoOrganisation}: ${_organisation.text.trim()}',
      '${l.demoTeamSize}: $_teamSize',
      if (_phone.text.trim().isNotEmpty) '${l.authPhone}: ${_phone.text.trim()}',
      if (_notes.text.trim().isNotEmpty) ...['', _notes.text.trim()],
    ].join('\n');

    try {
      await ref.read(catalogueRepositoryProvider).contact(
            name: _name.text.trim(),
            email: _email.text.trim(),
            subject: isDemo ? l.demoSubject : l.demoSubjectSpecialist,
            body: body,
          );
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.code.message(l));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final isDemo = widget.kind == DemoRequestKind.demo;
    final title = isDemo ? l.demoTitle : l.demoTitleSpecialist;

    return Scaffold(
      appBar: AppBar(
        title: BrandedTitle(title),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: _sent ? _Sent(l: l) : _form(l, title),
    );
  }

  Widget _form(L10n l, String title) => ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          Text(title,
              style: const TextStyle(
                  fontSize: 19, fontWeight: FontWeight.w800, height: 1.5)),
          const SizedBox(height: 8),
          Text(l.demoSubtitle,
              style: const TextStyle(
                  fontSize: 13.5, height: 1.9, color: BrandColors.muted)),
          const SizedBox(height: 22),
          TextField(
            controller: _name,
            decoration: InputDecoration(labelText: l.authName),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _organisation,
            decoration: InputDecoration(labelText: l.demoOrganisation),
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
            controller: _phone,
            keyboardType: TextInputType.phone,
            textDirection: TextDirection.ltr,
            decoration: InputDecoration(labelText: l.authPhone),
          ),
          const SizedBox(height: 18),
          Text(l.demoTeamSize,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final size in _sizes)
                ChoiceChip(
                  label: Text(size, textDirection: TextDirection.ltr),
                  selected: _teamSize == size,
                  onSelected: (_) => setState(() => _teamSize = size),
                ),
            ],
          ),
          const SizedBox(height: 18),
          TextField(
            controller: _notes,
            maxLines: 4,
            decoration: InputDecoration(labelText: l.demoNotes),
          ),
          if (_error != null) ...[
            const SizedBox(height: 14),
            Text(_error!,
                style: const TextStyle(
                    fontSize: 13.5, height: 1.7, color: Color(0xFFB3261E))),
          ],
          const SizedBox(height: 22),
          FilledButton(
            onPressed: _busy ? null : _submit,
            child: _busy
                ? const SizedBox(
                    height: 18,
                    width: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: Colors.white))
                : Text(l.demoSubmit),
          ),
        ],
      );
}

class _Sent extends StatelessWidget {
  const _Sent({required this.l});
  final L10n l;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.check_circle_outline,
                size: 50, color: Color(0xFF1A7F4B)),
            const SizedBox(height: 20),
            Text(l.demoSentTitle,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Text(l.demoSentBody,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 14, height: 1.9, color: BrandColors.muted)),
            const SizedBox(height: 26),
            FilledButton(
              onPressed: () => context.go('/'),
              child: Text(l.tabHome),
            ),
          ]),
        ),
      );
}
