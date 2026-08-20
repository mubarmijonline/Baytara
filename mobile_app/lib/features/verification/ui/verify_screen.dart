// Verification, as five screens in one flow: pick a route, capture, upload, wait, result.
//
// The result is three genuinely different answers, not success/failure. In particular a 202
// is NOT a failure and NOT a success: a human will decide, and the copy has to say so and
// tell the user not to resubmit, because a second pending request is refused.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/theme/tokens.dart';
import '../application/verification_controller.dart';
import '../data/verification_dto.dart';

class VerifyScreen extends ConsumerStatefulWidget {
  const VerifyScreen({super.key});

  @override
  ConsumerState<VerifyScreen> createState() => _VerifyScreenState();
}

class _VerifyScreenState extends ConsumerState<VerifyScreen> {
  late final VerificationController _controller =
      VerificationController(repository: ref.read(verificationRepositoryProvider));

  VerificationState _state = const VerificationState();
  VerificationRoute? _route;
  String? _frontPath;
  String? _backPath;

  @override
  void initState() {
    super.initState();
    _controller.stream.listen((s) {
      if (mounted) setState(() => _state = s);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _needsBothSides => _route == VerificationRoute.syndicateCard;
  bool get _canSubmit =>
      _frontPath != null && (!_needsBothSides || _backPath != null);

  Future<void> _pick({required bool front, required ImageSource source}) async {
    final picked = await ImagePicker().pickImage(
      source: source,
      // Large enough for a reader, small enough not to take a minute on mobile data.
      maxWidth: 2400,
      imageQuality: 88,
    );
    if (picked == null || !mounted) return;
    setState(() {
      if (front) {
        _frontPath = picked.path;
      } else {
        _backPath = picked.path;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final status = ref.watch(verificationStatusProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.verifyTitle)),
      body: SafeArea(
        child: switch (_state.stage) {
          VerificationStage.uploading ||
          VerificationStage.reading =>
            _Processing(state: _state),
          VerificationStage.done => _Result(
              result: _state.result!,
              onDone: () => context.go('/dashboard'),
              onRetry: () => setState(() {
                _state = const VerificationState();
                _frontPath = null;
                _backPath = null;
              }),
            ),
          VerificationStage.error => _ErrorResult(
              code: _state.error!,
              onRetry: () => setState(() => _state = const VerificationState()),
            ),
          _ => status.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Text(asApiExceptionCode(e).message(l),
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: BrandColors.muted, height: 1.8)),
                ),
              ),
              data: (s) {
                // Both of these are states the server would refuse, so the flow is not
                // offered at all rather than failing after a capture.
                if (s.isBaytarian) {
                  return _Notice(text: l.verifyAlreadyVerified, icon: Icons.verified);
                }
                if (s.hasPendingRequest) {
                  return _Notice(text: l.verifyRequestPending, icon: Icons.schedule);
                }
                return _routeAndCapture(l);
              },
            ),
        },
      ),
    );
  }

  Widget _routeAndCapture(L10n l) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Text(l.verifyIntro,
              style: const TextStyle(
                  fontSize: 14, height: 1.9, color: BrandColors.muted)),
          const SizedBox(height: 20),
          for (final route in VerificationRoute.values)
            _RouteTile(
              route: route,
              selected: _route == route,
              onTap: () => setState(() {
                _route = route;
                _frontPath = null;
                _backPath = null;
              }),
            ),
          if (_route != null) ...[
            const SizedBox(height: 20),
            _CaptureSlot(
              label: _needsBothSides ? l.verifyCaptureFront : l.verifyCaptureDocument,
              path: _frontPath,
              onCamera: () => _pick(front: true, source: ImageSource.camera),
              onGallery: () => _pick(front: true, source: ImageSource.gallery),
            ),
            if (_needsBothSides) ...[
              const SizedBox(height: 14),
              _CaptureSlot(
                label: l.verifyCaptureBack,
                path: _backPath,
                onCamera: () => _pick(front: false, source: ImageSource.camera),
                onGallery: () => _pick(front: false, source: ImageSource.gallery),
              ),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _canSubmit
                  ? () => _controller.submit(
                        route: _route!,
                        frontPath: _frontPath!,
                        backPath: _backPath,
                      )
                  : null,
              child: Text(l.verifySubmit),
            ),
          ],
        ],
      );
}

/// Unwraps whatever the FutureProvider caught into a code we have copy for.
ApiErrorCode asApiExceptionCode(Object error) =>
    error is ApiException ? error.code : ApiErrorCode.unknown;

class _RouteTile extends StatelessWidget {
  const _RouteTile({required this.route, required this.selected, required this.onTap});

  final VerificationRoute route;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final (title, hint) = switch (route) {
      VerificationRoute.syndicateCard => (l.verifyRouteCard, l.verifyRouteCardHint),
      VerificationRoute.nationalId => (
          l.verifyRouteNationalId,
          l.verifyRouteNationalIdHint
        ),
      VerificationRoute.otherDocument => (l.verifyRouteOther, l.verifyRouteOtherHint),
    };

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: selected ? BrandColors.accent : BrandColors.line,
          width: selected ? 1.6 : 1,
        ),
      ),
      child: ListTile(
        onTap: onTap,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Text(title,
            style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(hint,
              style: const TextStyle(
                  fontSize: 12.5, height: 1.6, color: BrandColors.muted2)),
        ),
        trailing: Icon(
          selected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
          color: selected ? BrandColors.accent : BrandColors.muted2,
        ),
      ),
    );
  }
}

class _CaptureSlot extends StatelessWidget {
  const _CaptureSlot({
    required this.label,
    required this.path,
    required this.onCamera,
    required this.onGallery,
  });

  final String label;
  final String? path;
  final VoidCallback onCamera;
  final VoidCallback onGallery;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        // A live preview of what was captured, so a blurry or cropped photo is caught here
        // rather than forty seconds later by the reader.
        if (path != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.file(File(path!),
                height: 170, width: double.infinity, fit: BoxFit.cover),
          ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onCamera,
              icon: const Icon(Icons.photo_camera_outlined, size: 18),
              label: Text(path == null ? l.verifyTakePhoto : l.verifyRetake),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(
              onPressed: onGallery,
              icon: const Icon(Icons.image_outlined, size: 18),
              label: Text(l.verifyFromGallery),
            ),
          ),
        ]),
      ],
    );
  }
}

class _Processing extends StatelessWidget {
  const _Processing({required this.state});
  final VerificationState state;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final uploading = state.stage == VerificationStage.uploading;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 54,
              height: 54,
              child: CircularProgressIndicator(
                // Real byte progress while uploading; indeterminate while the server reads,
                // because we genuinely do not know how far along it is.
                value: uploading ? state.uploadPercent / 100 : null,
                strokeWidth: 3,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              uploading ? l.verifyUploading(state.uploadPercent) : l.verifyProcessingTitle,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 10),
            Text(l.verifyProcessingBody,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 13.5, height: 1.9, color: BrandColors.muted)),
            if (!uploading) ...[
              const SizedBox(height: 14),
              // An honest counter. Forty seconds of unexplained spinner reads as broken.
              Text(l.verifyElapsed(state.elapsedSeconds),
                  style: const TextStyle(fontSize: 12.5, color: BrandColors.muted2)),
            ],
          ],
        ),
      ),
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({
    required this.result,
    required this.onDone,
    required this.onRetry,
  });

  final VerificationResult result;
  final VoidCallback onDone;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);

    final (icon, tone, title, body, label, action) = switch (result.outcome) {
      VerificationOutcome.verifiedVeterinarian => (
          Icons.verified,
          const Color(0xFF1A7F4B),
          l.verifiedVetTitle,
          l.verifiedVetBody,
          l.myLearning,
          onDone,
        ),
      VerificationOutcome.verifiedStudent => (
          Icons.verified,
          const Color(0xFF1A7F4B),
          l.verifiedStudentTitle,
          l.verifiedStudentBody,
          l.myLearning,
          onDone,
        ),
      // Neither success nor failure. A human will decide, and the copy says explicitly not
      // to resubmit, because a second pending request is refused with `request_pending`.
      VerificationOutcome.sentForReview => (
          Icons.hourglass_top,
          BrandColors.star,
          l.verifyPendingTitle,
          l.verifyPendingBody,
          l.myLearning,
          onDone,
        ),
      VerificationOutcome.couldNotVerify => (
          Icons.error_outline,
          const Color(0xFFB3261E),
          l.verifyFailedTitle,
          l.verifyFailedBody,
          l.commonRetry,
          onRetry,
        ),
    };

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 50, color: tone),
            const SizedBox(height: 20),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w800)),
            const SizedBox(height: 12),
            Text(body,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 14, height: 1.95, color: BrandColors.muted)),
            const SizedBox(height: 28),
            FilledButton(onPressed: action, child: Text(label)),
          ],
        ),
      ),
    );
  }
}

class _ErrorResult extends StatelessWidget {
  const _ErrorResult({required this.code, required this.onRetry});
  final ApiErrorCode code;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    // These three are situations, not transport failures, and each has its own copy.
    final message = switch (code) {
      ApiErrorCode.alreadyVerified => l.verifyAlreadyVerified,
      ApiErrorCode.requestPending => l.verifyRequestPending,
      ApiErrorCode.nationalIdRequired => l.verifyNationalIdRequired,
      ApiErrorCode.server => l.verifyServiceUnavailable,
      _ => code.message(l),
    };

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline, size: 46, color: BrandColors.muted2),
          const SizedBox(height: 20),
          Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, height: 1.95)),
          const SizedBox(height: 26),
          OutlinedButton(onPressed: onRetry, child: Text(l.commonRetry)),
        ]),
      ),
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, required this.icon});
  final String text;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 46, color: BrandColors.accent),
            const SizedBox(height: 20),
            Text(text,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 14.5, height: 1.9)),
          ]),
        ),
      );
}
