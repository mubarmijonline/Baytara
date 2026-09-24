// "Send this to someone."
//
// What it shares is the **website** URL for the page, never an in-app route and never the
// file. The client's reason for the library is reach: a reader sends a summary to a
// colleague, and that colleague lands on Baytara. So the link has to work for the
// colleague who does not have the app, which is what a plain https URL does — the OS hands
// it to the app when it is installed, and to the browser when it is not.
//
// This is not in tension with the reader's no-share rule. The page is meant to travel; the
// PDF is not.
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

import '../i18n/app_localizations.dart';
import 'app_link.dart';

class ShareLinkButton extends StatelessWidget {
  const ShareLinkButton({super.key, required this.location, required this.title});

  /// The in-app route being shared, e.g. `/library/merck-summary`. Translated to its
  /// public URL by [shareUrl].
  final String location;

  /// Put in front of the link, the way the website's share row does it.
  final String title;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return IconButton(
      icon: const Icon(Icons.share_outlined),
      tooltip: l.shareTooltip,
      onPressed: () => SharePlus.instance.share(
        ShareParams(text: '$title\n${shareUrl(location)}', subject: title),
      ),
    );
  }
}
