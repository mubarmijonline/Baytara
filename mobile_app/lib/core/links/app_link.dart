// Links that lead into the app, and the links the app hands out.
//
// Both directions live in one file on purpose: a share URL the website cannot serve, and
// an incoming URL the app cannot place, are the same bug seen from opposite ends.
//
// **The two URL spaces are not identical**, which is the whole reason this is a
// translation and not a pass-through. An article is `/blog/<slug>` on the website and
// `/articles/<slug>` in the app (frontend/web/src/App.jsx against lib/router/app_router.dart).
// Sharing the app's own path would hand a colleague a URL the site answers with a 404 —
// and it is the colleague *without* the app who matters most here, because they are the
// reader the section exists to win.
//
// A book is `/library/<slug>` on both sides, so it passes through unchanged.
import '../network/dio_client.dart';

/// The public site. Derived from the API base rather than written out again, so a build
/// pointed somewhere else shares links to that same somewhere else instead of sending a
/// tester to production.
String get siteOrigin => Uri.parse(kApiBaseUrl).origin;

/// The public URL for an in-app [location] — what a share sheet sends.
///
/// The URL always points at the website. That is what makes the link work for everyone:
/// someone with the app installed is handed over to it by the OS (App Links on Android,
/// Universal Links on iOS), and someone without it simply reads the page in a browser.
/// A custom `baytara://` scheme would do the opposite — it opens for the people who
/// already have the app and dead-ends for everyone else.
String shareUrl(String location) {
  final uri = Uri.parse(location);
  final segments = uri.pathSegments;
  final path = (segments.length == 2 && segments.first == 'articles')
      ? '/blog/${segments[1]}'
      : uri.path;
  return Uri.parse('$siteOrigin$path')
      .replace(queryParameters: uri.hasQuery ? uri.queryParameters : null)
      .toString();
}

/// Where an incoming link should land inside the app, or null when nothing here renders it.
///
/// Null is not a failure to swallow: the caller opens the URL in a browser instead, so a
/// link the app does not know still reaches the reader.
String? locationForLink(Uri uri) {
  if (uri.scheme != 'http' && uri.scheme != 'https') return null;
  final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
  if (segments.isEmpty) return null;

  // The payment return is parsed by checkout_controller.dart, which treats it as a signal
  // to ask the server rather than as an outcome. It must not be routed as an ordinary page.
  if (segments.first == 'payment') return null;

  switch (segments) {
    // The shelf, keeping `?shelf=books` so a link to the books tab opens on the books tab.
    case ['library']:
      final shelf = uri.queryParameters['shelf'];
      return shelf == 'books' ? '/library?shelf=books' : '/library';
    case ['library', final slug]:
      return '/library/$slug';

    // The website's blog index is the library now, and so is the app's.
    case ['blog']:
      return '/library';

    // `/blog/<slug>` is the website's article URL and the one people have been sharing;
    // `/articles/<slug>` is the app's own. Both land on the same screen.
    case ['blog', final slug]:
    case ['articles', final slug]:
      return '/articles/$slug';
  }
  return null;
}
