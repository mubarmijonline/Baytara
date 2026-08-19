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
import '../application/catalogue_providers.dart';
import '../data/catalogue_dto.dart';
import 'widgets/access_badge.dart';
import 'widgets/course_card.dart';

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
    final access = AccessState.resolve(
      session: ref.watch(sessionProvider),
      tier: course.tier,
      serverLockReason: course.lockReason,
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
              _Cta(course: course, access: access),
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
                _InstructorTile(instructor: course.instructor!),
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
class _Cta extends StatelessWidget {
  const _Cta({required this.course, required this.access});

  final Course course;
  final AccessState access;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);

    // Barred by the audience rule. There is no action to offer, so none is offered: a
    // button here would be a promise the server will not keep.
    if (access.reason == LockReason.nonVeterinariansOnly) {
      return _Notice(text: l.lockNonVets, icon: Icons.info_outline);
    }

    final (label, route) = switch (access.reason) {
      LockReason.needsAccount => (l.authSignIn, '/auth'),
      LockReason.needsPhone => (l.phoneSave, '/auth/phone'),
      LockReason.needsBaytarian => (l.lockNeedsBaytarian, '/verify'),
      LockReason.needsPurchase => (
          '${l.lockNeedsPurchase} · ${priceLabel(course.price, course.currency, l)}',
          '/buy/${course.slug}'
        ),
      _ => (l.enroll, '/courses/${course.slug}/enroll'),
    };

    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: () => context.push(route),
        child: Text(label),
      ),
    );
  }
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
