import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/providers.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(
    ProviderScope(
      overrides: [
        verboseNetworkLoggingProvider.overrideWithValue(kDebugMode),
      ],
      child: const BaytaraApp(),
    ),
  );
}
