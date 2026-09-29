// ignore_for_file: prefer_initializing_formals
// Drives one verification attempt.
//
// The processing state is not decoration. Reading a document takes 10 to 40 seconds, and a
// screen that shows a bare spinner for forty seconds reads as broken. So this exposes two
// honest numbers: upload progress in bytes while the file is going up, and elapsed seconds
// while the server is reading.
import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_error.dart';
import '../../../core/providers.dart';
import '../data/verification_dto.dart';
import '../data/verification_repository.dart';

final verificationRepositoryProvider = Provider<VerificationRepository>(
  (ref) => VerificationRepository(client: ref.watch(apiClientProvider)),
);

final verificationStatusProvider = FutureProvider<VerificationStatus>(
  (ref) => ref.watch(verificationRepositoryProvider).status(),
);

enum VerificationStage { idle, uploading, reading, done, error }

class VerificationState {
  const VerificationState({
    this.stage = VerificationStage.idle,
    this.uploadPercent = 0,
    this.elapsedSeconds = 0,
    this.result,
    this.error,
  });

  final VerificationStage stage;
  final int uploadPercent;

  /// Counted honestly from when the upload finished, not animated.
  final int elapsedSeconds;
  final VerificationResult? result;
  final ApiErrorCode? error;

  VerificationState copyWith({
    VerificationStage? stage,
    int? uploadPercent,
    int? elapsedSeconds,
    VerificationResult? result,
    ApiErrorCode? error,
  }) =>
      VerificationState(
        stage: stage ?? this.stage,
        uploadPercent: uploadPercent ?? this.uploadPercent,
        elapsedSeconds: elapsedSeconds ?? this.elapsedSeconds,
        result: result ?? this.result,
        error: error ?? this.error,
      );
}

class VerificationController {
  VerificationController({required VerificationRepository repository})
      : _repo = repository;

  final VerificationRepository _repo;
  final _controller = StreamController<VerificationState>.broadcast();
  Timer? _ticker;

  VerificationState state = const VerificationState();
  Stream<VerificationState> get stream => _controller.stream;

  void _emit(VerificationState next) {
    state = next;
    if (!_controller.isClosed) _controller.add(next);
  }

  Future<void> submit({
    required VerificationRoute route,
    required String frontPath,
    String? backPath,
  }) async {
    _emit(const VerificationState(stage: VerificationStage.uploading));

    void onProgress(int sent, int total) {
      if (total <= 0) return;
      final percent = (sent / total * 100).round();
      _emit(state.copyWith(uploadPercent: percent));
      // Once the bytes are up, the wait becomes the server reading. Switch the copy and
      // start counting, so the user is not watching a progress bar that has stopped.
      if (percent >= 100 && state.stage == VerificationStage.uploading) {
        _startReading();
      }
    }

    try {
      final result = route == VerificationRoute.syndicateCard
          ? await _repo.submitCard(
              frontPath: frontPath,
              backPath: backPath!,
              onProgress: onProgress,
            )
          : await _repo.submitDocument(
              route: route,
              frontPath: frontPath,
              backPath: backPath,
              onProgress: onProgress,
            );
      _stopTicker();
      _emit(state.copyWith(stage: VerificationStage.done, result: result));
    } on ApiException catch (e) {
      _stopTicker();
      _emit(state.copyWith(stage: VerificationStage.error, error: e.code));
    }
  }

  void _startReading() {
    _emit(state.copyWith(stage: VerificationStage.reading, elapsedSeconds: 0));
    _ticker?.cancel();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      _emit(state.copyWith(elapsedSeconds: state.elapsedSeconds + 1));
    });
  }

  void _stopTicker() {
    _ticker?.cancel();
    _ticker = null;
  }

  void dispose() {
    _stopTicker();
    _controller.close();
  }
}
