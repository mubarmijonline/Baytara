// The bootstrap screen: restore tokens, ask the server who they belong to, and let the
// guard decide where the app opens.
//
// It shows the brand mark on the same navy the native splash uses, so the hand-off from the
// OS splash to Flutter is invisible rather than a visible swap to a bare spinner.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme/tokens.dart';
import '../features/auth/application/auth_controller.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});

  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    // After the first frame: bootstrap moves the session, which moves the router, and a
    // redirect during build is not allowed.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => ref.read(authControllerProvider).bootstrap(),
    );
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: BrandColors.utilityBar,
        body: Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Same asset and ground colour as the native splash, so the two are one image
              // as far as the user is concerned.
              Image.asset('assets/brand/icon.png', height: 96),
              const SizedBox(height: 26),
              Image.asset('assets/brand/wordmark_white.png', height: 22),
              const SizedBox(height: 40),
              const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: BrandColors.gold),
              ),
            ],
          ),
        ),
      );
}
