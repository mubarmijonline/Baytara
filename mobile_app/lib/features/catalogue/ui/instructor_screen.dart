// An instructor's profile, and the learning-paths list.
//
// /instructors already returns each teacher's full row (bio, expertise, counts), so the
// profile is rendered from the list rather than fetched again.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../../../core/theme/branded_title.dart';
import '../application/catalogue_providers.dart';
import '../data/catalogue_dto.dart';

class InstructorScreen extends ConsumerWidget {
  const InstructorScreen({super.key, required this.instructorId});
  final int instructorId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(instructorsProvider);

    return Scaffold(
      appBar: AppBar(
        title: BrandedTitle(l.instructorsTitle),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/'),
        ),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Text(asApiException(e).code.message(l),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: BrandColors.muted, height: 1.8)),
              const SizedBox(height: 16),
              OutlinedButton(
                onPressed: () => ref.invalidate(instructorsProvider),
                child: Text(l.commonRetry),
              ),
            ]),
          ),
        ),
        data: (rows) {
          final person =
              rows.where((i) => i.id == instructorId).firstOrNull;
          if (person == null) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text(l.errLessonNotFound,
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: BrandColors.muted)),
              ),
            );
          }
          return _Profile(person: person);
        },
      ),
    );
  }
}

class _Profile extends StatelessWidget {
  const _Profile({required this.person});
  final InstructorRef person;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
      children: [
        Center(
          child: CircleAvatar(
            radius: 46,
            backgroundColor: BrandColors.accentSoft,
            backgroundImage: (person.avatarUrl?.isNotEmpty ?? false)
                ? NetworkImage(person.avatarUrl!)
                : null,
            child: (person.avatarUrl?.isEmpty ?? true)
                ? const Icon(Icons.person, size: 40, color: BrandColors.accent)
                : null,
          ),
        ),
        const SizedBox(height: 16),
        Text(person.name,
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 20, fontWeight: FontWeight.w800, height: 1.5)),
        if (person.headline?.trim().isNotEmpty ?? false) ...[
          const SizedBox(height: 6),
          Text(person.headline!,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 13.5, color: BrandColors.muted2)),
        ],
        const SizedBox(height: 22),
        Row(children: [
          _Stat(value: '${person.coursesCount}', label: l.statCourses),
          _Stat(value: '${person.lessonsCount}', label: l.navVideos),
          _Stat(value: '${person.studentsCount}', label: l.statStudents),
        ]),
        // expertise and specialties are separate lists on the wire; both are shown.
        if (person.expertise.isNotEmpty || person.specialties.isNotEmpty) ...[
          const SizedBox(height: 24),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final e in person.expertise) Chip(label: Text(e)),
              for (final s in person.specialties) Chip(label: Text(s)),
            ],
          ),
        ],
        if (person.bio?.trim().isNotEmpty ?? false) ...[
          const SizedBox(height: 24),
          Text(l.courseAbout,
              style: const TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w800, color: BrandColors.ink)),
          const SizedBox(height: 10),
          Text(person.bio!,
              style: const TextStyle(
                  fontSize: 14, height: 1.9, color: BrandColors.ink2)),
        ],
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Column(children: [
          Text(value,
              style: const TextStyle(
                  fontSize: 20, fontWeight: FontWeight.w800, color: BrandColors.ink)),
          const SizedBox(height: 2),
          Text(label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11.5, color: BrandColors.muted2)),
        ]),
      );
}

/// Learning paths: ordered runs of courses. Empty on the live site today, so this hides
/// itself rather than presenting an empty tab.
class PathsScreen extends ConsumerWidget {
  const PathsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(pathsProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.pathsTitle)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(pathsProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            Padding(
              padding: const EdgeInsets.all(32),
              child: Text(asApiException(e).code.message(l),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: BrandColors.muted, height: 1.8)),
            ),
          ]),
          data: (rows) => rows.isEmpty
              ? ListView(children: [
                  Padding(
                    padding: const EdgeInsets.all(40),
                    child: Center(
                      child: Text(l.pathsEmpty,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                              color: BrandColors.muted2, height: 1.8)),
                    ),
                  ),
                ])
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: rows.length,
                  itemBuilder: (context, i) {
                    final path = rows[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 12),
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: () => context.push('/paths/${path.slug}'),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(path.title,
                                  style: const TextStyle(
                                      fontSize: 15.5,
                                      fontWeight: FontWeight.w700,
                                      height: 1.5)),
                              if (path.description.trim().isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Text(path.description,
                                    maxLines: 3,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        fontSize: 13,
                                        height: 1.7,
                                        color: BrandColors.muted)),
                              ],
                              if (path.courses.isNotEmpty) ...[
                                const SizedBox(height: 10),
                                Text(l.lessonsCount(path.courses.length),
                                    style: const TextStyle(
                                        fontSize: 12, color: BrandColors.muted2)),
                              ],
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }
}

/// One learning path: its courses, in the order the path teaches them.
class PathDetailScreen extends ConsumerWidget {
  const PathDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(pathProvider(slug));

    return Scaffold(
      appBar: AppBar(),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(asApiException(e).code.message(l),
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.muted, height: 1.8)),
          ),
        ),
        data: (path) => ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
          children: [
            Text(path.title,
                style: const TextStyle(
                    fontSize: 21, fontWeight: FontWeight.w800, height: 1.5)),
            if (path.description.trim().isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(path.description,
                  style: const TextStyle(
                      fontSize: 14, height: 1.9, color: BrandColors.muted)),
            ],
            const SizedBox(height: 22),
            for (final (index, course) in path.courses.indexed)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                clipBehavior: Clip.antiAlias,
                child: ListTile(
                  onTap: () => context.push('/courses/${course.slug}'),
                  // Numbered: a path is an order, not a bag of courses.
                  leading: CircleAvatar(
                    radius: 16,
                    backgroundColor: BrandColors.accentSoft,
                    child: Text('${index + 1}',
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            color: BrandColors.accent)),
                  ),
                  title: Text(course.title,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
