// The two URL spaces, and the translation between them.
//
// The case that matters most: an article is /blog/<slug> on the website and
// /articles/<slug> in the app. Get that backwards and the app hands out links the site
// answers with a 404, to exactly the person who does not have the app.
import 'package:baytara/core/links/app_link.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('incoming links', () {
    test('a book opens the book', () {
      expect(locationForLink(Uri.parse('https://baytara.app/library/merck')),
          '/library/merck');
    });

    test('the shelf keeps the tab it was shared on', () {
      expect(locationForLink(Uri.parse('https://baytara.app/library?shelf=books')),
          '/library?shelf=books');
      expect(locationForLink(Uri.parse('https://baytara.app/library')), '/library');
    });

    test('the website article URL lands on the app article screen', () {
      expect(locationForLink(Uri.parse('https://baytara.app/blog/foot-rot')),
          '/articles/foot-rot');
    });

    test("the app's own article URL works too, since both are in circulation", () {
      expect(locationForLink(Uri.parse('https://baytara.app/articles/foot-rot')),
          '/articles/foot-rot');
    });

    test('the blog index is the library', () {
      expect(locationForLink(Uri.parse('https://baytara.app/blog')), '/library');
    });

    test('a payment return is not routed as a page', () {
      // checkout_controller.dart owns it, and it must ask the server rather than trust
      // the URL.
      expect(
        locationForLink(Uri.parse('https://baytara.app/payment/callback?pid=9&status=paid')),
        isNull,
      );
    });

    test('an unknown page is refused so the caller can open a browser instead', () {
      expect(locationForLink(Uri.parse('https://baytara.app/pricing')), isNull);
      expect(locationForLink(Uri.parse('https://baytara.app/')), isNull);
    });

    test('a non-web scheme is not a page link', () {
      expect(locationForLink(Uri.parse('baytara://library/merck')), isNull);
    });
  });

  group('outgoing links', () {
    test('a book shares its own path', () {
      expect(shareUrl('/library/merck'), '$siteOrigin/library/merck');
    });

    test('an article shares the website path, not the app one', () {
      expect(shareUrl('/articles/foot-rot'), '$siteOrigin/blog/foot-rot',
          reason: '/articles/<slug> is a 404 on the website');
    });

    test('the shelf query survives', () {
      expect(shareUrl('/library?shelf=books'), '$siteOrigin/library?shelf=books');
    });

    test('every shared link round-trips back to where it came from', () {
      for (final location in ['/library', '/library/merck', '/articles/foot-rot']) {
        expect(locationForLink(Uri.parse(shareUrl(location))), location,
            reason: 'a link the app hands out must be one the app can place');
      }
    });
  });
}
