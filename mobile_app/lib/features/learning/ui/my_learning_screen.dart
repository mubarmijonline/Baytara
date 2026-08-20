// My Learning: where to pick up, what is enrolled, and what has been earned.
//
// One thing this screen must not do is imply that free courses belong here. They produce no
// enrolment server-side and are simply watched, so an empty list is not evidence that the
// user has done nothing.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../application/learning_providers.dart';
import '../data/learning_dto.dart';

class MyLearningScreen extends ConsumerWidget {
  const MyLearningScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final summary = ref.watch(learningSummaryProvider);
    final enrollments = ref.watch(enrollmentsProvider);
    final certificates = ref.watch(certificatesProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.myLearning)),
      body: RefreshIndicator(
        onRefresh: () async {
          ref
            ..invalidate(learningSummaryProvider)
            ..invalidate(enrollmentsProvider)
            ..invalidate(certificatesProvider);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          children: [
            summary.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => _ErrorLine(message: asApiException(e).code.message(l)),
              data: (s) => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    _Stat(value: '${s.coursesEnrolled}', label: l.statCourses),
                    _Stat(value: '${s.watchedHours}', label: l.statHours),
                    // A streak day means a video was *started* that day; browsing does
                    // not count, and yesterday still counts so it does not read as broken
                    // before today's first lesson.
                    _Stat(value: '${s.streakDays}', label: l.statStreak),
                  ]),
                  if (s.resume != null) ...[
                    const SizedBox(height: 18),
                    _ResumeCard(resume: s.resume!),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 26),
            _Heading(l.myCourses),
            const SizedBox(height: 10),
            enrollments.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => _ErrorLine(message: asApiException(e).code.message(l)),
              data: (rows) => rows.isEmpty
                  ? Text(
                      // Says why it is empty rather than just that it is: free courses
                      // never appear here, which would otherwise look like a bug.
                      l.noEnrolmentsHint,
                      style: const TextStyle(
                          fontSize: 13.5, height: 1.8, color: BrandColors.muted2),
                    )
                  : Column(
                      children: [
                        for (final e in rows) _EnrollmentTile(enrollment: e),
                      ],
                    ),
            ),
            const SizedBox(height: 26),
            _Heading(l.certificatesTitle),
            const SizedBox(height: 10),
            certificates.when(
              loading: () => const SizedBox.shrink(),
              error: (e, _) => _ErrorLine(message: asApiException(e).code.message(l)),
              data: (rows) => rows.isEmpty
                  ? Text(l.noCertificates,
                      style: const TextStyle(
                          fontSize: 13.5, color: BrandColors.muted2))
                  : Column(
                      children: [
                        for (final c in rows)
                          Card(
                            margin: const EdgeInsets.only(bottom: 10),
                            child: ListTile(
                              leading: const Icon(Icons.workspace_premium_outlined,
                                  color: BrandColors.gold),
                              title: Text(c.courseTitle,
                                  style: const TextStyle(
                                      fontSize: 14, fontWeight: FontWeight.w700)),
                              subtitle: Text(c.serial,
                                  style: const TextStyle(
                                      fontSize: 12, color: BrandColors.muted2)),
                              onTap: () => context.push('/certificates/${c.serial}'),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResumeCard extends StatelessWidget {
  const _ResumeCard({required this.resume});
  final ResumePoint resume;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/learn/${resume.courseId}/${resume.lessonId}'),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(l.continueLearning,
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w700,
                      color: BrandColors.accent)),
              const SizedBox(height: 8),
              Text(resume.courseTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text(resume.lessonTitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 13, color: BrandColors.muted2)),
              const SizedBox(height: 12),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: resume.percent / 100,
                  minHeight: 6,
                  backgroundColor: BrandColors.line,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                l.lessonOfTotal(resume.lessonIndex, resume.totalLessons),
                style: const TextStyle(fontSize: 12, color: BrandColors.muted2),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EnrollmentTile extends StatelessWidget {
  const _EnrollmentTile({required this.enrollment});
  final Enrollment enrollment;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final course = enrollment.course;
    if (course == null) return const SizedBox.shrink();

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () => context.push('/courses/${course.slug}'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(course.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: enrollment.progress.percent / 100,
                  minHeight: 6,
                  backgroundColor: BrandColors.line,
                ),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Text(
                  l.lessonsDone(enrollment.progress.completedLessons,
                      enrollment.progress.totalLessons),
                  style: const TextStyle(fontSize: 12, color: BrandColors.muted2),
                ),
                const Spacer(),
                // A lapsed enrolment is a past customer. Renewal, not a fresh purchase.
                if (enrollment.isExpired)
                  TextButton(
                    onPressed: () =>
                        context.push('/buy/${course.slug}?kind=renewal'),
                    child: Text(l.renewAccess),
                  ),
              ]),
            ],
          ),
        ),
      ),
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
                  fontSize: 22, fontWeight: FontWeight.w800, color: BrandColors.ink)),
          const SizedBox(height: 2),
          Text(label,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 11.5, color: BrandColors.muted2)),
        ]),
      );
}

class _Heading extends StatelessWidget {
  const _Heading(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(
          fontSize: 16, fontWeight: FontWeight.w800, color: BrandColors.ink));
}

class _ErrorLine extends StatelessWidget {
  const _ErrorLine({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Text(message,
            style: const TextStyle(fontSize: 13, color: BrandColors.muted)),
      );
}
