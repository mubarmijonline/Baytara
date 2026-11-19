// A course page: what it is, who teaches it, what is in it, and what stands between the
// user and watching it.
//
// The CTA is driven by AccessState, so the button a user sees is the one the server would
// honour. A vet looking at a `general` course is told the tier is for non-vets rather than
// being offered a purchase that would be refused.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/access/access.dart';
import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../../auth/domain/session.dart';
import '../../learning/application/learning_providers.dart';
import '../../payments/data/purchase_availability.dart';
import '../application/catalogue_providers.dart';
import '../data/catalogue_dto.dart';
import 'widgets/access_badge.dart';
import 'widgets/course_card.dart';
import 'widgets/verify_prompt.dart';

class CourseDetailScreen extends ConsumerWidget {
  const CourseDetailScreen({super.key, required this.slug});
  final String slug;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(courseDetailProvider(slug));

    return Scaffold(
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(asApiException(e).code.message(l),
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: BrandColors.muted, height: 1.7)),
                const SizedBox(height: 16),
                OutlinedButton(
                  onPressed: () => ref.invalidate(courseDetailProvider(slug)),
                  child: Text(l.commonRetry),
                ),
              ],
            ),
          ),
        ),
        data: (course) => _Content(course: course),
      ),
    );
  }
}

class _Content extends ConsumerWidget {
  const _Content({required this.course});
  final Course course;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final session = ref.watch(sessionProvider);

    // Enrolment is website-only, so what the app needs to know is whether it has already
    // happened. Null while the list is still loading, so the CTA does not flash "not
    // available" at someone who is enrolled. Only fetched when signed in: /enrollments is
    // an authenticated call, and a 401 from it would go through the refresh path.
    bool? entitled = false;
    if (session is SessionSignedIn) {
      final enrollments = ref.watch(enrollmentsProvider);
      entitled = !enrollments.hasValue && enrollments.isLoading
          ? null
          : (enrollments.value ?? const []).any(
              (e) => e.course?.id == course.id && !e.isExpired);
    }

    final access = AccessState.resolve(
      session: session,
      tier: course.tier,
      serverLockReason: course.lockReason,
      entitled: entitled ?? false,
    );
    final duration = durationLabel(course.displayMinutes, l);

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 220,
          flexibleSpace: FlexibleSpaceBar(
            background: DecoratedBox(
              decoration: BoxDecoration(gradient: BrandGradients.thumbFor(course.id)),
              child: course.image == null || course.image!.isEmpty
                  ? null
                  : Image.network(course.image!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const SizedBox.shrink()),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(20, 18, 20, 40),
          sliver: SliverList.list(
            children: [
              Row(children: [
                TierChip(tier: course.tier),
                const SizedBox(width: 8),
                if (course.hasCertificate)
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.workspace_premium_outlined,
                        size: 15, color: BrandColors.gold),
                    const SizedBox(width: 4),
                    Text(l.certificateIncluded,
                        style:
                            const TextStyle(fontSize: 12, color: BrandColors.muted2)),
                  ]),
              ]),
              const SizedBox(height: 12),
              Text(course.title,
                  style: const TextStyle(
                      fontSize: 22, fontWeight: FontWeight.w800, height: 1.5,
                      color: BrandColors.ink)),
              const SizedBox(height: 12),
              Wrap(spacing: 14, runSpacing: 6, children: [
                if (course.rating != null)
                  _Meta(
                      icon: Icons.star_rounded,
                      text: '${course.rating!.toStringAsFixed(1)} ${l.reviewsCount(course.reviewsCount)}',
                      tone: BrandColors.star),
                if (course.lessonsCount > 0)
                  _Meta(
                      icon: Icons.play_circle_outline,
                      text: l.lessonsCount(course.lessonsCount)),
                if (duration != null) _Meta(icon: Icons.schedule, text: duration),
                if (course.enrolledCount > 0)
                  _Meta(
                      icon: Icons.people_outline,
                      text: l.enrolledCount(course.enrolledCount)),
                _Meta(
                  icon: Icons.lock_clock_outlined,
                  // NULL access_days means lifetime, not zero days.
                  text: course.isLifetime
                      ? l.lifetimeAccess
                      : l.accessDays(course.accessDays!),
                ),
              ]),
              const SizedBox(height: 20),
              _Cta(course: course, access: access, entitled: entitled),
              if (course.objectives.isNotEmpty) ...[
                const SizedBox(height: 26),
                _Heading(l.courseObjectives),
                const SizedBox(height: 10),
                for (final o in course.objectives)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      const Padding(
                        padding: EdgeInsets.only(top: 3),
                        child: Icon(Icons.check_circle_outline,
                            size: 16, color: BrandColors.accent),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(o,
                            style: const TextStyle(fontSize: 14, height: 1.7)),
                      ),
                    ]),
                  ),
              ],
              if (course.description.trim().isNotEmpty) ...[
                const SizedBox(height: 26),
                _Heading(l.courseAbout),
                const SizedBox(height: 10),
                Text(course.description,
                    style: const TextStyle(
                        fontSize: 14, height: 1.9, color: BrandColors.ink2)),
              ],
              if (course.instructor != null) ...[
                const SizedBox(height: 26),
                _Heading(l.courseInstructor),
                const SizedBox(height: 10),
                GestureDetector(
                  onTap: () =>
                      context.push('/instructors/${course.instructor!.id}'),
                  child: _InstructorTile(instructor: course.instructor!),
                ),
              ],
              if (course.videos.isNotEmpty) ...[
                const SizedBox(height: 26),
                _Heading(l.courseContent),
                const SizedBox(height: 10),
                for (final v in course.videos)
                  VideoCard(video: v, onTap: () => context.push('/videos/${v.id}')),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// The single call to action, chosen by what the server would allow.
///
/// Enrolment is website-only (see purchase_availability.dart), so this never enrols or
/// sells. It either unblocks the user (sign in, verify, add a phone), says enrolment is not
/// available here, or -- once enrolled -- starts the first lesson.
class _Cta extends StatelessWidget {
  const _Cta({required this.course, required this.access, required this.entitled});

  final Course course;
  final AccessState access;

  /// Enrolled with access that has not lapsed. Null while that is still being checked.
  final bool? entitled;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);

    // Barred by the audience rule. There is no action to offer, so none is offered: a
    // button here would be a promise the server will not keep.
    if (access.reason == LockReason.nonVeterinariansOnly) {
      return _Notice(text: l.lockNonVets, icon: Icons.info_outline);
    }
    if (access.reason == LockReason.needsBaytarian) {
      return const VerifyToWatchPrompt();
    }

    if (access.reason == LockReason.needsAccount) {
      return _Button(label: l.authSignIn, route: '/auth');
    }
    // Still checking the enrolments: show nothing rather than the wrong thing.
    if (entitled == null) return const SizedBox.shrink();

    // Not enrolled, free or paid: the price is still on the page above, but enrolling is
    // done on the website. No button and, on iOS, no link out -- Guideline 3.1.1.
    if (entitled == false) {
      return _Notice(
          text: PurchaseAvailability.unavailableNotice(l), icon: Icons.info_outline);
    }

    // Enrolled. The phone gate still blocks playback: the number is in the watermark.
    if (access.reason == LockReason.needsPhone) {
      return _Button(label: l.phoneSave, route: '/auth/phone');
    }
    if (course.videos.isEmpty) return const SizedBox.shrink();
    return _Button(
        label: l.watchNow, route: '/learn/${course.id}/${course.videos.first.id}');
  }
}

class _Button extends StatelessWidget {
  const _Button({required this.label, required this.route});
  final String label;
  final String route;

  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: FilledButton(
          onPressed: () => context.push(route),
          child: Text(label),
        ),
      );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.icon});
  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: BrandColors.surfaceMuted,
          border: Border.all(color: BrandColors.line),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(children: [
          Icon(icon, size: 18, color: BrandColors.muted2),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: const TextStyle(
                    fontSize: 13.5, height: 1.6, color: BrandColors.ink2)),
          ),
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

class _Meta extends StatelessWidget {
  const _Meta({required this.icon, required this.text, this.tone});
  final IconData icon;
  final String text;
  final Color? tone;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 15, color: tone ?? BrandColors.muted2),
        const SizedBox(width: 5),
        Text(text, style: const TextStyle(fontSize: 12.5, color: BrandColors.muted)),
      ]);
}

class _InstructorTile extends StatelessWidget {
  const _InstructorTile({required this.instructor});
  final InstructorRef instructor;

  @override
  Widget build(BuildContext context) => Row(children: [
        CircleAvatar(
          radius: 24,
          backgroundColor: BrandColors.accentSoft,
          backgroundImage: (instructor.avatarUrl?.isNotEmpty ?? false)
              ? NetworkImage(instructor.avatarUrl!)
              : null,
          child: (instructor.avatarUrl?.isEmpty ?? true)
              ? const Icon(Icons.person, color: BrandColors.accent)
              : null,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(instructor.name,
                  style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
              if (instructor.headline?.trim().isNotEmpty ?? false) ...[
                const SizedBox(height: 3),
                Text(instructor.headline!,
                    style:
                        const TextStyle(fontSize: 12.5, color: BrandColors.muted2)),
              ],
            ],
          ),
        ),
      ]);
}
