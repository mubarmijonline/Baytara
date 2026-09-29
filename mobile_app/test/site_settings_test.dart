// Site settings parsing.
//
// These exist because of a bug that shipped and went unnoticed: GET /settings nests
// everything under a `settings` key, the app read keys off the outer wrapper, every lookup
// missed, and each one fell through to a hardcoded fallback. Nothing threw. The Home page
// simply showed English placeholder text while the CMS held the real Arabic copy.
//
// The first test below is the one that would have caught it.
import 'package:baytara/features/catalogue/data/site_settings.dart';
import 'package:flutter_test/flutter_test.dart';

/// A trimmed copy of what the live endpoint actually returns.
Map<String, dynamic> _liveShape() => {
      'settings': {
        'hero': {
          'eyebrow': 'منصة بيطرة',
          'subtitle': 'أول منصة تعليمية بيطرية',
          'primary_cta': 'ابدأ التعلّم مجاناً',
          'secondary_cta': 'شاهد كيف تعمل',
          'featured_label': 'دورة مميّزة',
          'featured_title': 'جراحة الحيوانات الصغيرة',
          'image': '',
        },
        'home': {
          'categories_title': 'التصنيفات',
          'categories_subtitle': 'اختر تخصصك',
          'instructors_title': 'المدرّبون',
          'cta_title': 'ابدأ رحلة تعلّمك اليوم',
        },
        'stats': [
          {'num': '+120', 'label': 'دورة متخصصة'},
          {'num': '4.8/5', 'label': 'متوسط التقييم'},
        ],
        'testimonials': [
          {'quote': 'محتوى عملي ومفيد.', 'name': 'د. أحمد', 'role': 'طبيب بيطري'},
        ],
        'business': {
          'eyebrow': 'بيطرة للأعمال',
          'title': 'استثمر في نمو فريقك',
          'stats': [
            {'num': '+30', 'label': 'شركة'},
          ],
          'features': [],
          'logos': [],
        },
        'footer': {'copyright': 'x'},
      },
    };

void main() {
  group('the nested wrapper', () {
    test('unwraps the settings key', () {
      // The regression test. Reading the outer map directly is what broke Home.
      final s = SiteSettings.fromResponse(_liveShape());
      expect(s.hero.eyebrow, 'منصة بيطرة');
      expect(s.home.ctaTitle, 'ابدأ رحلة تعلّمك اليوم');
      expect(s.stats.length, 2);
    });

    test('an already-unwrapped map still works', () {
      // Defensive: a caller that hands over the inner object gets real values rather than
      // silent empties, which is precisely the failure mode being guarded against.
      final inner = _liveShape()['settings'] as Map<String, dynamic>;
      final s = SiteSettings.fromResponse(inner);
      expect(s.hero.eyebrow, 'منصة بيطرة');
    });

    test('a null body gives empty copy rather than throwing', () {
      final s = SiteSettings.fromResponse(null);
      expect(s.hero.eyebrow, isEmpty);
      expect(s.stats, isEmpty);
      expect(s.business.isEmpty, isTrue);
    });

    test('a missing block gives empty copy, not a crash', () {
      final s = SiteSettings.fromResponse({'settings': {}});
      expect(s.hero.subtitle, isEmpty);
      expect(s.home.categoriesTitle, isEmpty);
      expect(s.testimonials, isEmpty);
    });
  });

  group('hero', () {
    test('reads every field the CMS offers', () {
      final h = SiteSettings.fromResponse(_liveShape()).hero;
      expect(h.primaryCta, 'ابدأ التعلّم مجاناً');
      expect(h.secondaryCta, 'شاهد كيف تعمل');
      expect(h.featuredLabel, 'دورة مميّزة');
      expect(h.featuredTitle, 'جراحة الحيوانات الصغيرة');
      expect(h.image, isEmpty, reason: 'an empty string stays empty, not null');
    });

    test('whitespace-only copy counts as absent', () {
      // The CMS has fields padded with spaces and newlines; a blank one must fall back
      // rather than render as an empty heading.
      final s = SiteSettings.fromResponse({
        'settings': {'hero': {'eyebrow': '   \n ', 'subtitle': 'real'}},
      });
      expect(s.hero.eyebrow, isEmpty);
      expect(s.hero.subtitle, 'real');
    });
  });

  group('stats', () {
    test('numbers stay strings, because they are not numbers', () {
      // "+120" and "4.8/5" are pre-formatted marketing copy. Parsing them as numbers would
      // lose the plus sign and the ratio.
      final stats = SiteSettings.fromResponse(_liveShape()).stats;
      expect(stats.first.num, '+120');
      expect(stats.last.num, '4.8/5');
    });

    test('an empty list is empty, so the band hides', () {
      final s = SiteSettings.fromResponse({'settings': {'stats': []}});
      expect(s.stats, isEmpty);
    });

    test('a malformed entry does not take the list down', () {
      final s = SiteSettings.fromResponse({
        'settings': {
          'stats': ['not a map', {'num': '+5', 'label': 'x'}],
        },
      });
      expect(s.stats.length, 1, reason: 'the junk entry is dropped, the good one survives');
      expect(s.stats.single.num, '+5');
    });
  });

  group('testimonials', () {
    test('a quote-less entry is flagged empty so it can be filtered out', () {
      final s = SiteSettings.fromResponse({
        'settings': {
          'testimonials': [
            {'name': 'x', 'role': 'y'},
          ],
        },
      });
      expect(s.testimonials.single.isEmpty, isTrue);
    });
  });

  group('business', () {
    test('reads the block and its nested stats', () {
      final b = SiteSettings.fromResponse(_liveShape()).business;
      expect(b.eyebrow, 'بيطرة للأعمال');
      expect(b.stats.single.num, '+30');
      expect(b.isEmpty, isFalse);
    });

    test('empty features and logos stay empty so their headings stay hidden', () {
      // Both are empty arrays on the live site; rendering a heading over nothing is the
      // thing to avoid.
      final b = SiteSettings.fromResponse(_liveShape()).business;
      expect(b.features, isEmpty);
      expect(b.logos, isEmpty);
    });

    test('a block with no title or body counts as empty', () {
      final b = SiteSettings.fromResponse({'settings': {'business': {'eyebrow': 'x'}}}).business;
      expect(b.isEmpty, isTrue, reason: 'an eyebrow alone is not worth a banner');
    });
  });
}
