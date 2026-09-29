// Bundles and instructors. Both are simple lists over endpoints already wired; they were
// deferred from milestone 2 so the player milestone had room, and neither carries the access
// subtlety that made the courses list worth building first.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../application/catalogue_providers.dart';
import 'widgets/course_card.dart';
import '../../../core/theme/branded_title.dart';

class BundlesScreen extends ConsumerWidget {
  const BundlesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(bundlesProvider);

    return Scaffold(
      appBar: AppBar(title: BrandedTitle(l.bundlesTitle)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(bundlesProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _Error(message: asApiException(e).code.message(l)),
          data: (rows) => rows.isEmpty
              ? _Empty(text: l.bundlesEmpty)
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: rows.length,
                  itemBuilder: (context, i) => CourseCard(
                    course: rows[i],
                    onTap: () => context.push('/courses/${rows[i].slug}'),
                  ),
                ),
        ),
      ),
    );
  }
}

class InstructorsScreen extends ConsumerWidget {
  const InstructorsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(instructorsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.instructorsTitle)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(instructorsProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => _Error(message: asApiException(e).code.message(l)),
          data: (rows) => rows.isEmpty
              ? _Empty(text: l.instructorsEmpty)
              : ListView.separated(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  itemCount: rows.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final person = rows[i];
                    return ListTile(
                      onTap: () => context.push('/instructors/${person.id}'),
                      leading: CircleAvatar(
                        radius: 22,
                        backgroundColor: BrandColors.accentSoft,
                        backgroundImage: (person.avatarUrl?.isNotEmpty ?? false)
                            ? NetworkImage(person.avatarUrl!)
                            : null,
                        child: (person.avatarUrl?.isEmpty ?? true)
                            ? const Icon(Icons.person, color: BrandColors.accent)
                            : null,
                      ),
                      title: Text(person.name,
                          style: const TextStyle(
                              fontSize: 14.5, fontWeight: FontWeight.w700)),
                      subtitle: (person.headline?.trim().isNotEmpty ?? false)
                          ? Text(person.headline!,
                              style: const TextStyle(
                                  fontSize: 12.5, color: BrandColors.muted2))
                          : null,
                    );
                  },
                ),
        ),
      ),
    );
  }
}

class _Error extends StatelessWidget {
  const _Error({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => ListView(children: [
        Padding(
          padding: const EdgeInsets.all(32),
          child: Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: BrandColors.muted, height: 1.7)),
        ),
      ]);
}

class _Empty extends StatelessWidget {
  const _Empty({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => ListView(children: [
        Padding(
          padding: const EdgeInsets.all(40),
          child: Center(
            child: Text(text, style: const TextStyle(color: BrandColors.muted2)),
          ),
        ),
      ]);
}
