// Course and video cards.
//
// Both resolve their own AccessState from the session, so a card cannot show a Buy button
// for something the server would refuse on audience grounds.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/access/access.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/theme/tokens.dart';
import '../../../auth/domain/session.dart';
import '../../data/catalogue_dto.dart';
import 'access_badge.dart';

/// "1h 20m" style, from a minute count. Returns null for 0, which means "length unknown"
/// rather than "zero minutes" -- a course with nothing attached measures 0.
String? durationLabel(int minutes, L10n l) {
  if (minutes <= 0) return null;
  if (minutes < 60) return l.minutesShort(minutes);
  final hours = minutes ~/ 60;
  final rest = minutes % 60;
  return rest == 0 ? l.hoursShort(hours) : '${l.hoursShort(hours)} ${l.minutesShort(rest)}';
}

String priceLabel(double price, String currency, L10n l) =>
    price <= 0 ? l.priceFree : '${price.toStringAsFixed(0)} $currency';

class CourseCard extends ConsumerWidget {
  const CourseCard({super.key, required this.course, this.onTap, this.entitled = false});

  final Course course;
  final VoidCallback? onTap;

  /// True when the user is already enrolled; suppresses the price and the Buy prompt.
  final bool entitled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final access = AccessState.resolve(
      session: ref.watch(sessionProvider),
      tier: course.tier,
      serverLockReason: course.lockReason,
      entitled: entitled,
    );
    final duration = durationLabel(course.displayMinutes, l);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: _Thumb(image: course.image, seed: course.id),
            ),
            Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    TierChip(tier: course.tier),
                    const Spacer(),
                    if (course.hasCertificate)
                      const Icon(Icons.workspace_premium_outlined,
                          size: 15, color: BrandColors.gold),
                  ]),
                  const SizedBox(height: 8),
                  Text(
                    course.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700, height: 1.5,
                        color: BrandColors.ink),
                  ),
                  if (course.instructor != null) ...[
                    const SizedBox(height: 4),
                    Text(course.instructor!.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12.5, color: BrandColors.muted2)),
                  ],
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 12,
                    runSpacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      _RatingBit(rating: course.rating, count: course.reviewsCount),
                      if (course.lessonsCount > 0)
                        _MetaBit(
                            icon: Icons.play_circle_outline,
                            text: l.lessonsCount(course.lessonsCount)),
                      if (duration != null)
                        _MetaBit(icon: Icons.schedule, text: duration),
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      // A price is only meaningful when buying is actually the next step.
                      // A vet barred from `general` is not a customer for it.
                      if (course.isPaid &&
                          !entitled &&
                          access.reason != LockReason.nonVeterinariansOnly)
                        Text(
                          priceLabel(course.price, course.currency, l),
                          style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: BrandColors.accent),
                        ),
                      const Spacer(),
                      LockLine(access: access),
                    ],
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

class VideoCard extends ConsumerWidget {
  const VideoCard({super.key, required this.video, this.onTap});

  final Video video;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final access = AccessState.resolve(
      session: ref.watch(sessionProvider),
      tier: video.tier,
      serverLockReason: video.lockReason,
      // /videos responses carry the authoritative flag; inside a course tree it is null
      // and AccessState derives the answer instead.
      canPlay: video.canPlay,
    );
    final duration = durationLabel(video.durationMinutes ?? 0, l);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 132,
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: _Thumb(image: video.poster, seed: video.id, compact: true),
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(children: [
                      TierChip(tier: video.tier),
                      if (duration != null) ...[
                        const SizedBox(width: 8),
                        Text(duration,
                            style: const TextStyle(
                                fontSize: 11.5, color: BrandColors.muted2)),
                      ],
                    ]),
                    const SizedBox(height: 6),
                    Text(
                      video.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700, height: 1.45,
                          color: BrandColors.ink),
                    ),
                    const SizedBox(height: 8),
                    LockLine(access: access),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Falls back to a brand gradient rather than a grey box: the catalogue has plenty of items
/// with no artwork, and a wall of grey rectangles reads as broken.
class _Thumb extends StatelessWidget {
  const _Thumb({this.image, required this.seed, this.compact = false});

  final String? image;
  final int seed;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final gradient = BrandGradients.thumbFor(seed);
    if (image == null || image!.isEmpty) {
      return DecoratedBox(
        decoration: BoxDecoration(gradient: gradient),
        child: Center(
          child: Icon(Icons.play_circle_fill,
              size: compact ? 26 : 40, color: Colors.white.withValues(alpha: 0.55)),
        ),
      );
    }
    return Image.network(
      image!,
      fit: BoxFit.cover,
      errorBuilder: (_, _, _) => DecoratedBox(decoration: BoxDecoration(gradient: gradient)),
    );
  }
}

class _RatingBit extends StatelessWidget {
  const _RatingBit({this.rating, required this.count});
  final double? rating;
  final int count;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    // The server sends null, never 0, for an unrated course: a zero would read as a bad
    // course rather than a new one. Say "new" instead of printing a score.
    if (rating == null) {
      return Text(l.notRated,
          style: const TextStyle(fontSize: 12, color: BrandColors.muted2));
    }
    return Row(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.star_rounded, size: 15, color: BrandColors.star),
      const SizedBox(width: 3),
      Text(rating!.toStringAsFixed(1),
          style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
      const SizedBox(width: 2),
      Text(l.reviewsCount(count),
          style: const TextStyle(fontSize: 11.5, color: BrandColors.muted2)),
    ]);
  }
}

class _MetaBit extends StatelessWidget {
  const _MetaBit({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 14, color: BrandColors.muted2),
        const SizedBox(width: 4),
        Text(text, style: const TextStyle(fontSize: 12, color: BrandColors.muted2)),
      ]);
}
