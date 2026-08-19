// Runs the one-time bootstrap: restore tokens, ask the server who they belong to, and let
// the guard decide where the app opens. Shows nothing but a spinner, briefly.
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
  Widget build(BuildContext context) => const Scaffold(
        backgroundColor: BrandColors.utilityBar,
        body: Center(
          child: CircularProgressIndicator(color: BrandColors.gold),
        ),
      );
}
