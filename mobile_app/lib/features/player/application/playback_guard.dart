// The capture guard, as the Dart side sees it.
//
// One service over two very different platform implementations, and the difference is worth
// stating rather than hiding behind a common interface:
//
//   Android  FLAG_SECURE blanks the picture and ALLOW_CAPTURE_BY_NONE silences the audio.
//            A recording is already useless before this class does anything. The Android 15
//            callback is a bonus that lets us pause and report as well.
//   iOS      FairPlay blanks the picture in a recording. Nothing silences the audio and
//            nothing blocks a screenshot, so the app refuses to play while a capture is
//            running: pause, cover, report.
//
// What this class must never do is resume on its own. The condition clearing is not consent
// to carry on; the user takes an explicit action.
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../data/playback_dto.dart';

class CaptureSignal {
  const CaptureSignal({required this.captured, required this.reason});

  /// True while a capture is believed to be running.
  final bool captured;
  final SuspiciousReason reason;
}

class PlaybackGuard {
  PlaybackGuard({MethodChannel? channel})
      : _channel = channel ?? const MethodChannel('app.baytara/capture_guard');

  final MethodChannel _channel;

  /// Fired when a capture starts or stops. The player pauses and covers on `captured`.
  ValueChanged<CaptureSignal>? onCaptureChanged;

  /// Fired for something already done and unpreventable, a screenshot on iOS. There is
  /// nothing to pause; it is reported so there is evidence.
  ValueChanged<SuspiciousReason>? onSuspicious;

  bool _active = false;

  /// Turns on the per-route protections. Called when a player route opens.
  ///
  /// FLAG_SECURE is scoped to playback rather than the whole app on purpose: blocking
  /// screenshots everywhere would stop a user sending a colleague a course description, and
  /// that costs goodwill without protecting anything.
  Future<void> enable() async {
    if (_active) return;
    _channel.setMethodCallHandler(_handle);
    await _invoke('enableCaptureProtection');
    _active = true;
  }

  Future<void> disable() async {
    if (!_active) return;
    await _invoke('disableCaptureProtection');
    _channel.setMethodCallHandler(null);
    _active = false;
  }

  /// "L1", "L3", or null. On an L3 device the Android video path is not hardware protected
  /// and a determined capture can succeed. Reported so the product can decide what to do;
  /// this class does not refuse playback on its own.
  Future<String?> widevineSecurityLevel() async =>
      await _invoke<String?>('widevineSecurityLevel');

  Future<bool> isCaptured() async =>
      await _invoke<bool>('isScreenCaptured') ?? false;

  Future<void> _handle(MethodCall call) async {
    switch (call.method) {
      case 'captureStateChanged':
        final args = (call.arguments as Map?) ?? const {};
        onCaptureChanged?.call(CaptureSignal(
          captured: args['captured'] as bool? ?? false,
          reason: _reasonFrom(args['reason'] as String?),
        ));
      case 'suspicious':
        final args = (call.arguments as Map?) ?? const {};
        onSuspicious?.call(_reasonFrom(args['reason'] as String?));
    }
  }

  static SuspiciousReason _reasonFrom(String? wire) => switch (wire) {
        'screenshot' => SuspiciousReason.screenshot,
        'mirroring' => SuspiciousReason.mirroring,
        'background' => SuspiciousReason.background,
        _ => SuspiciousReason.screenRecording,
      };

  Future<T?> _invoke<T>(String method) async {
    try {
      return await _channel.invokeMethod<T>(method);
    } on MissingPluginException {
      // No host implementation: a unit test, or a platform where the channel is absent.
      // Playback should not be blocked by the guard being unavailable to *ask*; the real
      // protections (FLAG_SECURE, FairPlay) are host-side and unaffected either way.
      return null;
    } on PlatformException catch (e) {
      debugPrint('capture guard ${e.code}: ${e.message}');
      return null;
    }
  }
}
