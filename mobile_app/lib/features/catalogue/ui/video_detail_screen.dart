// A single video.
//
// This is where a standalone video is played from, so it carries the same access reasoning
// as the course page: the button offered is the one the server would honour, and a tier the
// user is barred from offers no purchase at all.
//
// Unlike a course-tree lesson, a /videos/<id> response DOES carry `can_play`, so that flag is
// authoritative here and AccessState defers to it.
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

class VideoDetailScreen extends ConsumerWidget {
  const VideoDetailScreen({super.key, required this.videoId});
  final int videoId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(videoDetailProvider(videoId));

    return Scaffold(
      appBar: AppBar(),
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
                onPressed: () => ref.invalidate(videoDetailProvider(videoId)),
                child: Text(l.commonRetry),
              ),
            ]),
          ),
        ),
        data: (video) => _Body(video: video),
      ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.video});
  final Video video;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final access = AccessState.resolve(
      session: ref.watch(sessionProvider),
      tier: video.tier,
      serverLockReason: video.lockReason,
      canPlay: video.canPlay,
    );
    final duration = durationLabel(video.durationMinutes ?? 0, l);

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        AspectRatio(
          aspectRatio: 16 / 9,
          child: DecoratedBox(
            decoration: BoxDecoration(gradient: BrandGradients.thumbFor(video.id)),
            child: Stack(
              fit: StackFit.expand,
              children: [
                if (video.poster?.isNotEmpty ?? false)
                  Image.network(video.poster!,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => const SizedBox.shrink()),
                Center(
                  child: Icon(
                    access.isOpen ? Icons.play_circle_fill : Icons.lock_outline,
                    size: 56,
                    color: Colors.white.withValues(alpha: 0.9),
                  ),
                ),
              ],
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                TierChip(tier: video.tier),
                if (duration != null) ...[
                  const SizedBox(width: 10),
                  Text(duration,
                      style: const TextStyle(
                          fontSize: 12.5, color: BrandColors.muted2)),
                ],
                if (video.isProtected) ...[
                  const SizedBox(width: 10),
                  const Icon(Icons.shield_outlined,
                      size: 14, color: BrandColors.muted2),
                ],
              ]),
              const SizedBox(height: 14),
              Text(video.title,
                  style: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800, height: 1.5,
                      color: BrandColors.ink)),
              if (video.instructor != null) ...[
                const SizedBox(height: 8),
                Text(video.instructor!.name,
                    style: const TextStyle(
                        fontSize: 13, color: BrandColors.muted2)),
              ],
              const SizedBox(height: 20),
              _Cta(video: video, access: access),
              if (video.description.trim().isNotEmpty) ...[
                const SizedBox(height: 26),
                Text(l.courseAbout,
                    style: const TextStyle(
                        fontSize: 16, fontWeight: FontWeight.w800,
                        color: BrandColors.ink)),
                const SizedBox(height: 10),
                Text(video.description,
                    style: const TextStyle(
                        fontSize: 14, height: 1.9, color: BrandColors.ink2)),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Cta extends StatelessWidget {
  const _Cta({required this.video, required this.access});

  final Video video;
  final AccessState access;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);

    // Nothing is on sale to someone the audience rule bars, so no button is offered.
    if (access.reason == LockReason.nonVeterinariansOnly) {
      return _Notice(text: l.lockNonVets);
    }
    // A video with no media attached cannot be played however entitled the user is.
    if (!video.hasVideo) {
      return _Notice(text: l.errNoVideo);
    }

    final (label, onTap) = switch (access.reason) {
      LockReason.none => (
          l.watchNow,
          // course_id 0 means "no course context": the server resolves it as standalone.
          () => context.push('/learn/0/${video.id}'),
        ),
      LockReason.needsAccount => (l.authSignIn, () => context.push('/auth')),
      LockReason.needsPhone => (l.phoneSave, () => context.push('/auth/phone')),
      LockReason.needsBaytarian => (
          l.lockNeedsBaytarian,
          () => context.push('/verify'),
        ),
      LockReason.needsPurchase => (
          '${l.lockNeedsPurchase} · ${priceLabel(video.price, video.currency, l)}',
          () => context.push('/buy/${video.id}?kind=video&video_id=${video.id}'),
        ),
      // Returned early above, but the compiler cannot see that.
      LockReason.nonVeterinariansOnly => (l.lockNonVets, () {}),
    };

    return SizedBox(
      width: double.infinity,
      child: FilledButton(onPressed: onTap, child: Text(label)),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text});
  final String text;

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
          const Icon(Icons.info_outline, size: 18, color: BrandColors.muted2),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: const TextStyle(
                    fontSize: 13.5, height: 1.6, color: BrandColors.ink2)),
          ),
        ]),
      );
}
