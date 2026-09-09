// The player for self-hosted lessons.
//
// Delivery is AES-128 encrypted HLS from our own server. Every playlist, segment and key
// URI carries the signed token minted by POST /video/playback, so this widget does not
// authenticate anything and does not touch key material: it is handed one master playlist
// URL and ExoPlayer/AVPlayer does the rest.
//
// What this widget IS responsible for is the watermark. On the DRM path VdoCipher bakes the
// viewer's identity into the picture server-side; on this path the server sends the text and
// says plainly that our player renders it (backend/app/api/v1/video.py). Skipping it would
// ship the self-hosted path with strictly weaker attribution than the DRM one, on exactly
// the videos we host ourselves.
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

import '../application/telemetry_bridge.dart';

class LocalPlayerView extends StatefulWidget {
  const LocalPlayerView({
    super.key,
    required this.url,
    required this.onSnapshot,
    required this.onError,
    this.watermark,
    this.resumePositionSeconds = 0,
    this.paused = false,
  });

  /// Absolute master playlist URL, token already in the query.
  final String url;

  /// Viewer text drawn over the picture. Null only if the server sent none.
  final String? watermark;

  /// Where the server says this viewer stopped last time.
  final int resumePositionSeconds;

  /// Every value change from the player, adapted for the telemetry rules.
  final void Function(PlayerSnapshot) onSnapshot;

  /// A playback failure, reported to the server as `player_error`.
  final void Function(String code, String? message) onError;

  /// The capture guard is holding playback down. Nothing may play while this is true.
  final bool paused;

  @override
  State<LocalPlayerView> createState() => _LocalPlayerViewState();
}

class _LocalPlayerViewState extends State<LocalPlayerView> {
  VideoPlayerController? _controller;
  Timer? _watermarkTimer;

  /// Which of the anchor points the watermark currently sits on. It moves so that a crop or
  /// an overlay placed once cannot keep it off the recording for a whole lesson.
  int _watermarkSlot = 0;

  bool _ready = false;
  String? _failure;

  /// Errors are reported once. `VideoPlayerValue` keeps `hasError` set, and the listener
  /// fires repeatedly, so without this one broken stream becomes a stream of events.
  bool _errorReported = false;

  @override
  void initState() {
    super.initState();
    _open();
    _watermarkTimer = Timer.periodic(const Duration(seconds: 17), (_) {
      if (mounted) setState(() => _watermarkSlot++);
    });
  }

  Future<void> _open() async {
    final controller = VideoPlayerController.networkUrl(Uri.parse(widget.url));
    _controller = controller;
    controller.addListener(_onValue);
    try {
      await controller.initialize();
      if (widget.resumePositionSeconds > 0) {
        await controller.seekTo(Duration(seconds: widget.resumePositionSeconds));
      }
      if (!mounted) return;
      setState(() => _ready = true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _failure = e.toString());
      _report('open_failed', e.toString());
    }
  }

  void _onValue() {
    final v = _controller?.value;
    if (v == null) return;

    if (v.hasError) {
      _report('playback_failed', v.errorDescription);
      if (mounted && _failure == null) {
        setState(() => _failure = v.errorDescription ?? 'playback_failed');
      }
      return;
    }

    if (!v.isInitialized) return;

    widget.onSnapshot(PlayerSnapshot(
      position: v.position,
      duration: v.duration,
      isPlaying: v.isPlaying,
      isEnded: v.isCompleted,
    ));

    if (mounted) setState(() {});
  }

  void _report(String code, String? message) {
    if (_errorReported) return;
    _errorReported = true;
    widget.onError(code, message);
  }

  @override
  void didUpdateWidget(LocalPlayerView old) {
    super.didUpdateWidget(old);
    // The guard came down mid-lesson. Pausing here rather than only covering the surface
    // means the audio stops too, which is the half a screen recorder would otherwise keep.
    if (widget.paused && !old.paused) _controller?.pause();
  }

  @override
  void dispose() {
    _watermarkTimer?.cancel();
    _controller?.removeListener(_onValue);
    _controller?.dispose();
    super.dispose();
  }

  void _togglePlay() {
    final controller = _controller;
    if (controller == null || widget.paused) return;
    controller.value.isPlaying ? controller.pause() : controller.play();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _controller;
    if (_failure != null) {
      return const Center(
        child: Icon(Icons.error_outline, color: Colors.white54, size: 34),
      );
    }
    if (controller == null || !_ready) {
      return const Center(child: CircularProgressIndicator());
    }

    final v = controller.value;
    return AspectRatio(
      aspectRatio: v.aspectRatio == 0 ? 16 / 9 : v.aspectRatio,
      child: Stack(
        fit: StackFit.expand,
        children: [
          VideoPlayer(controller),
          if (widget.watermark != null)
            _Watermark(text: widget.watermark!, slot: _watermarkSlot),
          if (v.isBuffering)
            const Center(child: CircularProgressIndicator(strokeWidth: 2)),
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _togglePlay,
              child: v.isPlaying
                  ? const SizedBox.shrink()
                  : const Center(
                      child: Icon(Icons.play_arrow_rounded,
                          size: 64, color: Colors.white70),
                    ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: _Scrubber(controller: controller),
          ),
        ],
      ),
    );
  }
}

/// The viewer text, moved between anchor points every few seconds.
///
/// Deliberately readable rather than subtle: its whole job is to be legible in a recording
/// that someone else is watching. It is drawn last so nothing in the player covers it.
class _Watermark extends StatelessWidget {
  const _Watermark({required this.text, required this.slot});

  final String text;
  final int slot;

  static const _anchors = [
    Alignment(0.82, -0.78),
    Alignment(-0.82, 0.72),
    Alignment(0.78, 0.74),
    Alignment(-0.80, -0.76),
    Alignment.center,
  ];

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedAlign(
        alignment: _anchors[slot % _anchors.length],
        duration: const Duration(milliseconds: 900),
        curve: Curves.easeInOut,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Text(
            text,
            textDirection: TextDirection.ltr,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.42),
              fontSize: 11,
              height: 1.2,
              shadows: const [Shadow(color: Colors.black54, blurRadius: 3)],
            ),
          ),
        ),
      ),
    );
  }
}

class _Scrubber extends StatelessWidget {
  const _Scrubber({required this.controller});

  final VideoPlayerController controller;

  static String _clock(Duration d) {
    final total = math.max(0, d.inSeconds);
    final h = total ~/ 3600;
    final m = (total % 3600) ~/ 60;
    final s = total % 60;
    final mm = m.toString().padLeft(2, '0');
    final ss = s.toString().padLeft(2, '0');
    return h > 0 ? '$h:$mm:$ss' : '$mm:$ss';
  }

  @override
  Widget build(BuildContext context) {
    final v = controller.value;
    return Container(
      color: Colors.black45,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      // Times read left to right in every locale, so this bar stays LTR under Arabic.
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Row(
          children: [
            Text(_clock(v.position),
                style: const TextStyle(color: Colors.white70, fontSize: 11)),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 10),
                child: VideoProgressIndicator(
                  controller,
                  allowScrubbing: true,
                  colors: const VideoProgressColors(
                    playedColor: Color(0xFFC9A227),
                    bufferedColor: Colors.white30,
                    backgroundColor: Colors.white12,
                  ),
                ),
              ),
            ),
            Text(_clock(v.duration),
                style: const TextStyle(color: Colors.white70, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}
