// App Links / Universal Links.
//
// The gateway redirects to https://baytara.app/payment/callback?status=...&pid=... . On
// Android the intent filter in AndroidManifest.xml claims that host so the app is opened
// instead of the browser; on iOS the same is done with an associated domain (milestone 8).
//
// The link is a *signal to ask*, never an answer. It carries the payment id and nothing the
// app trusts. See checkout_controller.dart.
import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';

class DeepLinkService {
  DeepLinkService({AppLinks? links}) : _links = links ?? AppLinks();

  final AppLinks _links;
  StreamSubscription<Uri>? _subscription;

  /// Starts listening. [onLink] receives both the link that launched the app and any that
  /// arrive while it is running.
  Future<void> start(ValueChanged<Uri> onLink) async {
    // A link that launched a cold start is not delivered to the stream, so it is fetched
    // separately or the very first payment return would be missed.
    final initial = await _links.getInitialLink();
    if (initial != null) onLink(initial);

    _subscription = _links.uriLinkStream.listen(
      onLink,
      // A malformed link is not worth crashing the app over.
      onError: (Object e) => debugPrint('deep link error: $e'),
    );
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }
}
