// The home page's section widgets, kept out of home_screen.dart so the page itself reads as
// a list of sections rather than a wall of layout.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/theme/tokens.dart';
import '../../../learning/data/learning_dto.dart';
import '../../data/catalogue_dto.dart';
import '../../data/site_settings.dart';

/// Hero, with the card the website shows: resume progress when signed in and mid-course,
/// otherwise the featured-course teaser from the CMS.
class HomeHero extends StatelessWidget {
  const HomeHero({
    super.key,
    required this.hero,
    required this.fallbackTitle,
    required this.fallbackSubtitle,
    this.greeting,
    this.resume,
  });

  final HeroCopy hero;
  final String fallbackTitle;
  final String fallbackSubtitle;
  final String? greeting;
  final ResumePoint? resume;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    // The CMS has no separate hero title, only an eyebrow and a subtitle. The eyebrow is the
    // headline sentence, so it leads when present.
    final headline = hero.eyebrow.isNotEmpty ? hero.eyebrow : fallbackTitle;
    final subtitle = hero.subtitle.isNotEmpty ? hero.subtitle : fallbackSubtitle;

    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(gradient: BrandGradients.hero),
      padding: const EdgeInsets.fromLTRB(20, 56, 20, 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            // The wordmark, so the brand is present from the first pixel of the app.
            Image.asset('assets/brand/wordmark_white.png', height: 26),
            const Spacer(),
          ]),
          const SizedBox(height: 22),
          if (greeting != null) ...[
            Text(greeting!,
                style: TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w700,
                    color: BrandColors.gold.withValues(alpha: 0.95))),
            const SizedBox(height: 8),
          ],
          Text(headline,
              style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: Colors.white,
                  height: 1.55)),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(subtitle,
                style: TextStyle(
                    fontSize: 13.5,
                    height: 1.9,
                    color: Colors.white.withValues(alpha: 0.85))),
          ],
          const SizedBox(height: 20),
          Wrap(spacing: 10, runSpacing: 10, children: [
            FilledButton(
              onPressed: () => context.go('/courses'),
              style: FilledButton.styleFrom(
                backgroundColor: BrandColors.gold,
                foregroundColor: BrandColors.ink,
              ),
              child: Text(
                  hero.primaryCta.isNotEmpty ? hero.primaryCta : l.coursesTitle),
            ),
            OutlinedButton(
              onPressed: () => context.push('/how-it-works'),
              style: OutlinedButton.styleFrom(
                foregroundColor: Colors.white,
                side: BorderSide(color: Colors.white.withValues(alpha: 0.5)),
              ),
              child: Text(hero.secondaryCta.isNotEmpty
                  ? hero.secondaryCta
                  : l.videosTitle),
            ),
          ]),
          if (resume != null) ...[
            const SizedBox(height: 22),
            _ResumeCard(resume: resume!),
          ] else if (hero.featuredTitle.isNotEmpty) ...[
            const SizedBox(height: 22),
            _FeaturedCard(hero: hero),
          ],
        ],
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
    return Container(
      padding: const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(l.continueLearning,
              style: const TextStyle(
                  fontSize: 11.5,
                  fontWeight: FontWeight.w800,
                  color: BrandColors.gold)),
          const SizedBox(height: 8),
          Text(resume.courseTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  fontSize: 14.5, fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 3),
          Text(resume.lessonTitle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 12.5, color: Colors.white.withValues(alpha: 0.75))),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: resume.percent / 100,
              minHeight: 5,
              backgroundColor: Colors.white.withValues(alpha: 0.2),
              valueColor: const AlwaysStoppedAnimation(BrandColors.gold),
            ),
          ),
          const SizedBox(height: 8),
          Text(l.lessonOfTotal(resume.lessonIndex, resume.totalLessons),
              style: TextStyle(
                  fontSize: 11.5, color: Colors.white.withValues(alpha: 0.7))),
        ],
      ),
    );
  }
}

class _FeaturedCard extends StatelessWidget {
  const _FeaturedCard({required this.hero});
  final HeroCopy hero;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.22)),
        ),
        child: Row(children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: BrandColors.gold.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.star_rounded, color: BrandColors.gold),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (hero.featuredLabel.isNotEmpty)
                  Text(hero.featuredLabel,
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: BrandColors.gold)),
                const SizedBox(height: 3),
                Text(hero.featuredTitle,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700,
                        color: Colors.white, height: 1.4)),
              ],
            ),
          ),
        ]),
      );
}

/// The four CMS figures. Editable marketing copy, not live counts.
class StatsBand extends StatelessWidget {
  const StatsBand({super.key, required this.stats});
  final List<StatItem> stats;

  @override
  Widget build(BuildContext context) {
    final visible = stats.where((s) => !s.isEmpty).toList();
    if (visible.isEmpty) return const SizedBox.shrink();

    return Container(
      color: BrandColors.surfaceMuted,
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
      child: Row(
        children: [
          for (final s in visible)
            Expanded(
              child: Column(children: [
                Text(s.num,
                    // Numbers read left-to-right even in an Arabic layout.
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w800,
                        color: BrandColors.accent)),
                const SizedBox(height: 3),
                Text(s.label,
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 11, height: 1.4, color: BrandColors.muted2)),
              ]),
            ),
        ],
      ),
    );
  }
}

/// A titled block, with an optional subtitle and "see all".
class HomeSection extends StatelessWidget {
  const HomeSection({
    super.key,
    required this.title,
    required this.child,
    this.subtitle = '',
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String subtitle;
  final Widget child;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsetsDirectional.only(start: 20, end: 8),
              child: Row(children: [
                Expanded(
                  child: Text(title,
                      style: const TextStyle(
                          fontSize: 17.5,
                          fontWeight: FontWeight.w800,
                          color: BrandColors.ink)),
                ),
                if (actionLabel != null && onAction != null)
                  TextButton(onPressed: onAction, child: Text(actionLabel!)),
              ]),
            ),
            if (subtitle.isNotEmpty)
              Padding(
                padding: const EdgeInsetsDirectional.only(start: 20, end: 20, top: 2),
                child: Text(subtitle,
                    style: const TextStyle(
                        fontSize: 13, height: 1.7, color: BrandColors.muted2)),
              ),
            const SizedBox(height: 14),
            child,
          ],
        ),
      );
}

class CategoryChip extends StatelessWidget {
  const CategoryChip({super.key, required this.category, required this.onTap});

  final Category category;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(21),
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: BrandColors.surface,
            border: Border.all(color: BrandColors.line),
            borderRadius: BorderRadius.circular(21),
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text(category.name,
                style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: BrandColors.ink2)),
            if (category.videoCount > 0) ...[
              const SizedBox(width: 7),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                decoration: BoxDecoration(
                  color: BrandColors.accentSoft,
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Text('${category.videoCount}',
                    style: const TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        color: BrandColors.accent)),
              ),
            ],
          ]),
        ),
      );
}

class InstructorChip extends StatelessWidget {
  const InstructorChip({super.key, required this.instructor, required this.onTap});

  final InstructorRef instructor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: 92,
          child: Column(children: [
            CircleAvatar(
              radius: 33,
              backgroundColor: BrandColors.accentSoft,
              backgroundImage: (instructor.avatarUrl?.isNotEmpty ?? false)
                  ? NetworkImage(instructor.avatarUrl!)
                  : null,
              child: (instructor.avatarUrl?.isEmpty ?? true)
                  ? const Icon(Icons.person, color: BrandColors.accent, size: 29)
                  : null,
            ),
            const SizedBox(height: 8),
            Text(instructor.name,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 11.5, fontWeight: FontWeight.w600, height: 1.35)),
          ]),
        ),
      );
}

class TestimonialList extends StatelessWidget {
  const TestimonialList({super.key, required this.testimonials});
  final List<Testimonial> testimonials;

  @override
  Widget build(BuildContext context) => SizedBox(
        height: 158,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          itemCount: testimonials.length,
          separatorBuilder: (_, _) => const SizedBox(width: 12),
          itemBuilder: (context, i) {
            final t = testimonials[i];
            return Container(
              width: 290,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: BrandColors.surface,
                border: Border.all(color: BrandColors.line),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.format_quote,
                      color: BrandColors.gold, size: 22),
                  const SizedBox(height: 8),
                  Expanded(
                    child: Text(t.quote,
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13.5, height: 1.8, color: BrandColors.ink2)),
                  ),
                  const SizedBox(height: 10),
                  Text(t.name,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700)),
                  if (t.role.isNotEmpty)
                    Text(t.role,
                        style: const TextStyle(
                            fontSize: 11.5, color: BrandColors.muted2)),
                ],
              ),
            );
          },
        ),
      );
}

class BusinessBanner extends StatelessWidget {
  const BusinessBanner({super.key, required this.business, required this.onTap});

  final BusinessCopy business;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 30, 20, 0),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: BrandGradients.darkPanel,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (business.eyebrow.isNotEmpty)
                Text(business.eyebrow,
                    style: const TextStyle(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w800,
                        color: BrandColors.gold)),
              const SizedBox(height: 8),
              Text(business.title,
                  style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      height: 1.5)),
              if (business.body.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(business.body,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13,
                        height: 1.8,
                        color: Colors.white.withValues(alpha: 0.82))),
              ],
              const SizedBox(height: 14),
              Row(children: [
                Text(
                  business.primaryCta.isNotEmpty ? business.primaryCta : l.seeAll,
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: BrandColors.gold),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.arrow_forward, size: 15, color: BrandColors.gold),
              ]),
            ],
          ),
        ),
      ),
    );
  }
}

class FinalCta extends StatelessWidget {
  const FinalCta({
    super.key,
    required this.title,
    required this.subtitle,
    required this.fallbackTitle,
    required this.buttonLabel,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final String fallbackTitle;
  final String buttonLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 32, 20, 8),
        child: Column(children: [
          Image.asset('assets/brand/icon.png', height: 40),
          const SizedBox(height: 14),
          Text(title.isNotEmpty ? title : fallbackTitle,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800, height: 1.5,
                  color: BrandColors.ink)),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(subtitle,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 13.5, height: 1.85, color: BrandColors.muted)),
          ],
          const SizedBox(height: 18),
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: onTap, child: Text(buttonLabel)),
          ),
        ]),
      );
}

/// Shape while the first load is in flight, rather than a bare spinner on a blank page.
class HomeSkeleton extends StatelessWidget {
  const HomeSkeleton({super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 28, 20, 0),
        child: Column(
          children: [
            for (var i = 0; i < 3; i++)
              Container(
                height: 84,
                margin: const EdgeInsets.only(bottom: 12),
                decoration: BoxDecoration(
                  color: BrandColors.surfaceMuted,
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
          ],
        ),
      );
}
