// The lesson player.
//
// The order of operations here is the security contract, not a style choice:
//   1. turn the capture protections on BEFORE an OTP exists, so there is no window where a
//      frame could be captured unprotected;
//   2. mint, which is the only place access is granted;
//   3. play, reporting events throughout;
//   4. turn the protections off only on the way out.
//
// Every refusal from the mint is mapped to the thing the user can actually do about it,
// which is what PlaybackRecovery is for.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:vdocipher_flutter/vdocipher_flutter.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';
import '../application/playback_guard.dart';
import '../application/playback_session_controller.dart';
import '../data/playback_dto.dart';
import '../data/playback_repository.dart';

final playbackRepositoryProvider = Provider<PlaybackRepository>(
  (ref) => PlaybackRepository(client: ref.watch(apiClientProvider)),
);

class PlayerScreen extends ConsumerStatefulWidget {
  const PlayerScreen({super.key, required this.lessonId, this.courseId});

  final int lessonId;
  final int? courseId;

  @override
  ConsumerState<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends ConsumerState<PlayerScreen> {
  final _guard = PlaybackGuard();

  PlaybackSessionController? _controller;
  VdoPlayerController? _player;

  bool _loading = true;
  ApiErrorCode? _refusal;

  /// True while a capture is running. Playback stays down and the surface stays covered
  /// until the user explicitly restarts it: the condition clearing is not consent.
  bool _blockedByCapture = false;

  @override
  void initState() {
    super.initState();
    _guard
      ..onCaptureChanged = _onCaptureChanged
      ..onSuspicious = _onSuspicious;
    _start();
  }

  Future<void> _start() async {
    // Protections first. Minting before this would leave a window, however short, in which
    // a frame could reach a recorder unprotected.
    await _guard.enable();

    try {
      final session = await ref
          .read(playbackRepositoryProvider)
          .mint(lessonId: widget.lessonId, courseId: widget.courseId);

      final controller = PlaybackSessionController(
        repository: ref.read(playbackRepositoryProvider),
        session: session,
        onSessionClosed: _onSessionClosed,
        onFatal: (code) => setState(() => _refusal = code),
      );
      if (session.resumePositionSeconds > 0) {
        controller.onSeek(session.resumePositionSeconds);
      }

      if (!mounted) return;
      setState(() {
        _controller = controller;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _refusal = e.code;
        _loading = false;
      });
    }
  }

  void _onCaptureChanged(CaptureSignal signal) {
    if (!mounted) return;
    if (signal.captured) {
      _player?.pause();
      setState(() => _blockedByCapture = true);
      _controller?.reportSuspicious(signal.reason);
    } else {
      // The recording stopped, but playback does not resume on its own.
      setState(() => _blockedByCapture = false);
    }
  }

  void _onSuspicious(SuspiciousReason reason) {
    // Already happened and unpreventable, an iOS screenshot. Nothing to pause.
    _controller?.reportSuspicious(reason);
  }

  void _onSessionClosed() {
    if (!mounted) return;
    // The session is finished server-side. Re-minting is the only way forward, and it is
    // the user's call because every mint counts against their hourly ceiling.
    setState(() {
      _controller?.dispose();
      _controller = null;
      _refusal = ApiErrorCode.sessionClosed;
    });
  }

  @override
  void dispose() {
    _controller?.dispose();
    _guard.disable();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);

    return Scaffold(
      backgroundColor: const Color(0xFF0D1430),
      appBar: AppBar(backgroundColor: const Color(0xFF0D1430)),
      body: SafeArea(
        child: switch (this) {
          _ when _loading => const Center(child: CircularProgressIndicator()),
          _ when _refusal != null => _RefusalView(
              code: _refusal!,
              onRetry: () {
                setState(() {
                  _refusal = null;
                  _loading = true;
                });
                _start();
              },
            ),
          _ => _playerBody(l),
        },
      ),
    );
  }

  Widget _playerBody(L10n l) {
    final controller = _controller;
    if (controller == null) return const SizedBox.shrink();

    return Stack(
      children: [
        Center(
          child: AspectRatio(
            aspectRatio: 16 / 9,
            child: VdoPlayer(
              embedInfo: EmbedInfo.streaming(
                otp: controller.sessionOtp,
                playbackInfo: controller.sessionPlaybackInfo,
              ),
              onPlayerCreated: (player) => _player = player,
              onError: (error) => controller.reportPlayerError(
                error.code.toString(),
                message: error.message,
              ),
            ),
          ),
        ),
        if (_blockedByCapture)
          Positioned.fill(
            child: ColoredBox(
              color: const Color(0xFF141E42),
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(28),
                  child: Text(
                    l.captureBlocked,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        color: Colors.white, fontSize: 16, height: 1.8),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _RefusalView extends StatelessWidget {
  const _RefusalView({required this.code, required this.onRetry});

  final ApiErrorCode code;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final recovery = code.recovery;

    // The four capability-gate codes cannot happen in the app: they mean the BaytaraApp/1
    // marker went missing from the User-Agent. Saying so beats a generic apology, because
    // the person seeing it is far more likely to be us than a learner.
    final message = code.indicatesMissingAppUserAgent
        ? 'Client configuration error (${code.wire}).'
        : code.message(l);

    final (actionLabel, route) = switch (recovery) {
      PlaybackRecovery.signIn => (l.authSignIn, '/auth'),
      PlaybackRecovery.phoneGate => (l.phoneSave, '/auth/phone'),
      PlaybackRecovery.devices => (l.devicesTitle, '/account/devices'),
      PlaybackRecovery.reAuth => (l.authSignIn, '/auth'),
      PlaybackRecovery.verify => (l.lockNeedsBaytarian, '/verify'),
      PlaybackRecovery.purchase => (l.lockNeedsPurchase, '/pricing'),
      PlaybackRecovery.renew => (l.lockNeedsPurchase, '/pricing'),
      _ => (null, null),
    };

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.lock_outline, color: Colors.white54, size: 34),
            const SizedBox(height: 18),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white, fontSize: 15, height: 1.9),
            ),
            const SizedBox(height: 24),
            if (actionLabel != null && route != null)
              FilledButton(
                onPressed: () => context.push(route),
                child: Text(actionLabel),
              )
            else if (recovery == PlaybackRecovery.retryLater)
              OutlinedButton(
                onPressed: onRetry,
                style: OutlinedButton.styleFrom(foregroundColor: BrandColors.gold),
                child: Text(l.commonRetry),
              ),
          ],
        ),
      ),
    );
  }
}
