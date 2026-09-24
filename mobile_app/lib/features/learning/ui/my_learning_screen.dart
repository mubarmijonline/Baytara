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
import '../../payments/data/purchase_availability.dart';
import '../../account/ui/notifications_screen.dart';
import '../../auth/domain/session.dart';
import '../application/learning_providers.dart';
import '../data/learning_dto.dart';
import '../../../core/theme/branded_title.dart';

class MyLearningScreen extends ConsumerWidget {
  const MyLearningScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final session = ref.watch(sessionProvider);
    final summary = ref.watch(learningSummaryProvider);
    final enrollments = ref.watch(enrollmentsProvider);
    final certificates = ref.watch(certificatesProvider);

    return Scaffold(
      appBar: AppBar(
        title: BrandedTitle(l.myLearning),
        actions: [
          NotificationBell(onTap: () => context.push('/account/notifications')),
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => context.push('/account/settings'),
          ),
        ],
      ),
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
            _Greeting(session: session),
            const SizedBox(height: 18),
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
                // Finished the material: the exam is the next thing, and the only route
                // to the certificate on a course that sets one. Shown whether or not the
                // course has an exam, because only the server knows -- the exam screen
                // says so plainly if there is none.
                if (enrollment.progress.isComplete && !enrollment.isExpired)
                  TextButton(
                    onPressed: () => context.push('/courses/${course.slug}/exam'),
                    child: Text(l.examAction),
                  ),
                // A lapsed enrolment is a past customer. Renewal, not a fresh purchase --
                // and under the reader model it says the access ended without offering a
                // way to pay, which would be the same steering as a buy button.
                if (enrollment.isExpired)
                  if (PurchaseAvailability.purchasesEnabled)
                    TextButton(
                      onPressed: () =>
                          context.push('/buy/${course.slug}?kind=renewal'),
                      child: Text(l.renewAccess),
                    )
                  else
                    Text(l.errAccessExpired,
                        style: const TextStyle(
                            fontSize: 12, color: BrandColors.muted2)),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

/// A personal header. Signed out it invites sign-in rather than greeting nobody, since this
/// tab is reachable without an account.
class _Greeting extends ConsumerWidget {
  const _Greeting({required this.session});
  final SessionState session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);

    if (session is! SessionSignedIn) {
      return Card(
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => context.push('/auth'),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(children: [
              const CircleAvatar(
                radius: 22,
                backgroundColor: BrandColors.accentSoft,
                child: Icon(Icons.person_outline, color: BrandColors.accent),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(l.greetingSignedOut,
                        style: const TextStyle(
                            fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 3),
                    Text(l.greetingSignedOutHint,
                        style: const TextStyle(
                            fontSize: 12.5, color: BrandColors.muted2)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: BrandColors.muted2),
            ]),
          ),
        ),
      );
    }

    final user = (session as SessionSignedIn).user;
    // First name only: the full legal name on a greeting reads like a form, not a hello.
    final firstName = user.name.trim().split(RegExp(r'\s+')).first;

    return Row(children: [
      CircleAvatar(
        radius: 26,
        backgroundColor: BrandColors.accentSoft,
        child: Text(
          firstName.isEmpty ? '?' : firstName.characters.first,
          style: const TextStyle(
              fontSize: 21, fontWeight: FontWeight.w800, color: BrandColors.accent),
        ),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(l.greetingHello(firstName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 18, fontWeight: FontWeight.w800, height: 1.4)),
            const SizedBox(height: 3),
            Row(children: [
              if (user.isBaytarian) ...[
                const Icon(Icons.verified, size: 14, color: Color(0xFF1A7F4B)),
                const SizedBox(width: 4),
                Text(
                  user.isVetStudent ? l.verifiedStudentTitle : l.verifiedVetTitle,
                  style: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600,
                      color: Color(0xFF1A7F4B)),
                ),
              ] else
                // Not a scolding: it is the one action that unlocks vet content, so it is
                // offered as a link rather than stated as a deficiency.
                GestureDetector(
                  onTap: () => context.push('/verify'),
                  child: Text(l.greetingGetVerified,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: BrandColors.accent)),
                ),
            ]),
          ],
        ),
      ),
    ]);
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
