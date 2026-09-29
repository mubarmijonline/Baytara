// Site copy and configuration from GET /settings.
//
// This model exists because of a bug worth remembering: the endpoint returns
// `{"settings": { ... }}`, nested one level, and the app used to hand callers the outer
// wrapper. Every lookup then missed, fell through to a hardcoded fallback, and **failed
// silently** -- the Home page showed English placeholder copy for weeks while the CMS held
// the real Arabic marketing text. Nothing errored, so nothing surfaced it.
//
// Unwrapping happens once, here, and the blocks are typed. A raw map shared across screens
// is exactly how that bug happened.
//
// No per-language handling: the API localises its own content from the Accept-Language
// header the Dio interceptor already sends.

/// Reads a nested object safely, whatever map type the decoder produced.
Map<String, dynamic> _obj(Object? v) =>
    v is Map ? v.cast<String, dynamic>() : const {};

List<Map<String, dynamic>> _list(Object? v) => v is List
    ? [for (final e in v) if (e is Map) e.cast<String, dynamic>()]
    : const [];

String _str(Map<String, dynamic> m, String key) {
  final v = m[key];
  return v is String ? v.trim() : '';
}

class SiteSettings {
  const SiteSettings({
    this.hero = const HeroCopy(),
    this.home = const HomeCopy(),
    this.stats = const [],
    this.testimonials = const [],
    this.business = const BusinessCopy(),
    this.about = const AboutCopy(),
    this.contact = const ContactCopy(),
    this.footer = const {},
    this.socials = const {},
  });

  /// Unwraps the `settings` key. Accepts an already-unwrapped map too, so a caller that
  /// hands over the inner object still works rather than silently producing empties.
  factory SiteSettings.fromResponse(Map<String, dynamic>? body) {
    if (body == null) return const SiteSettings();
    final root = body.containsKey('settings') ? _obj(body['settings']) : body;

    return SiteSettings(
      hero: HeroCopy.fromJson(_obj(root['hero'])),
      home: HomeCopy.fromJson(_obj(root['home'])),
      stats: [for (final s in _list(root['stats'])) StatItem.fromJson(s)],
      testimonials: [
        for (final t in _list(root['testimonials'])) Testimonial.fromJson(t),
      ],
      business: BusinessCopy.fromJson(_obj(root['business'])),
      about: AboutCopy.fromJson(_obj(root['about'])),
      contact: ContactCopy.fromJson(_obj(root['contact'])),
      footer: _obj(root['footer']),
      socials: _obj(root['socials']),
    );
  }

  final HeroCopy hero;
  final HomeCopy home;
  final List<StatItem> stats;
  final List<Testimonial> testimonials;
  final BusinessCopy business;
  final AboutCopy about;
  final ContactCopy contact;
  final Map<String, dynamic> footer;
  final Map<String, dynamic> socials;
}

class HeroCopy {
  const HeroCopy({
    this.eyebrow = '',
    this.subtitle = '',
    this.primaryCta = '',
    this.secondaryCta = '',
    this.featuredLabel = '',
    this.featuredTitle = '',
    this.image = '',
  });

  factory HeroCopy.fromJson(Map<String, dynamic> j) => HeroCopy(
        eyebrow: _str(j, 'eyebrow'),
        subtitle: _str(j, 'subtitle'),
        primaryCta: _str(j, 'primary_cta'),
        secondaryCta: _str(j, 'secondary_cta'),
        featuredLabel: _str(j, 'featured_label'),
        featuredTitle: _str(j, 'featured_title'),
        image: _str(j, 'image'),
      );

  final String eyebrow;
  final String subtitle;
  final String primaryCta;
  final String secondaryCta;
  final String featuredLabel;
  final String featuredTitle;
  final String image;
}

/// The eleven section titles the CMS controls on the home page.
class HomeCopy {
  const HomeCopy({
    this.categoriesTitle = '',
    this.categoriesSubtitle = '',
    this.instructorsTitle = '',
    this.instructorsSubtitle = '',
    this.newTitle = '',
    this.featuredTitle = '',
    this.testimonialsTitle = '',
    this.ctaTitle = '',
    this.ctaSubtitle = '',
    this.pathsTitle = '',
    this.pathsSubtitle = '',
  });

  factory HomeCopy.fromJson(Map<String, dynamic> j) => HomeCopy(
        categoriesTitle: _str(j, 'categories_title'),
        categoriesSubtitle: _str(j, 'categories_subtitle'),
        instructorsTitle: _str(j, 'instructors_title'),
        instructorsSubtitle: _str(j, 'instructors_subtitle'),
        newTitle: _str(j, 'new_title'),
        featuredTitle: _str(j, 'featured_title'),
        testimonialsTitle: _str(j, 'testimonials_title'),
        ctaTitle: _str(j, 'cta_title'),
        ctaSubtitle: _str(j, 'cta_subtitle'),
        pathsTitle: _str(j, 'paths_title'),
        pathsSubtitle: _str(j, 'paths_subtitle'),
      );

  final String categoriesTitle;
  final String categoriesSubtitle;
  final String instructorsTitle;
  final String instructorsSubtitle;
  final String newTitle;
  final String featuredTitle;
  final String testimonialsTitle;
  final String ctaTitle;
  final String ctaSubtitle;
  final String pathsTitle;
  final String pathsSubtitle;
}

/// One figure in the stats band.
///
/// These are **editable marketing copy**, not live counts. The CMS currently claims 120
/// courses while GET /courses returns none; the website shows the same figures, and the
/// product decision was to match it. Changing them is an admin-panel edit.
class StatItem {
  const StatItem({required this.num, required this.label});

  factory StatItem.fromJson(Map<String, dynamic> j) => StatItem(
        num: _str(j, 'num'),
        label: _str(j, 'label'),
      );

  /// A pre-formatted string like "+8,000" or "4.8/5", not a number to format.
  final String num;
  final String label;

  bool get isEmpty => num.isEmpty && label.isEmpty;
}

class Testimonial {
  const Testimonial({required this.quote, required this.name, required this.role});

  factory Testimonial.fromJson(Map<String, dynamic> j) => Testimonial(
        quote: _str(j, 'quote'),
        name: _str(j, 'name'),
        role: _str(j, 'role'),
      );

  final String quote;
  final String name;
  final String role;

  bool get isEmpty => quote.isEmpty;
}

class BusinessCopy {
  const BusinessCopy({
    this.eyebrow = '',
    this.title = '',
    this.body = '',
    this.trust = '',
    this.primaryCta = '',
    this.secondaryCta = '',
    this.stats = const [],
    this.features = const [],
    this.logos = const [],
  });

  factory BusinessCopy.fromJson(Map<String, dynamic> j) => BusinessCopy(
        eyebrow: _str(j, 'eyebrow'),
        title: _str(j, 'title'),
        body: _str(j, 'body'),
        trust: _str(j, 'trust'),
        primaryCta: _str(j, 'primary_cta'),
        secondaryCta: _str(j, 'secondary_cta'),
        stats: [for (final s in _list(j['stats'])) StatItem.fromJson(s)],
        features: [
          for (final f in _list(j['features']))
            BusinessFeature(title: _str(f, 'title'), body: _str(f, 'body')),
        ],
        logos: [
          for (final v in (j['logos'] as List? ?? const [])) v.toString(),
        ],
      );

  final String eyebrow;
  final String title;
  final String body;
  final String trust;
  final String primaryCta;
  final String secondaryCta;
  final List<StatItem> stats;
  final List<BusinessFeature> features;
  final List<String> logos;

  /// Nothing worth rendering. The banner and the page both hide themselves rather than
  /// showing an empty shell.
  bool get isEmpty => title.isEmpty && body.isEmpty && stats.isEmpty;
}

class AboutCopy {
  const AboutCopy({this.title = '', this.body = '', this.values = const []});

  factory AboutCopy.fromJson(Map<String, dynamic> j) => AboutCopy(
        title: _str(j, 'title'),
        body: _str(j, 'body'),
        values: [
          for (final v in _list(j['values']))
            AboutValue(title: _str(v, 'title'), description: _str(v, 'description')),
        ],
      );

  final String title;
  final String body;
  final List<AboutValue> values;

  bool get isEmpty => title.isEmpty && body.isEmpty && values.isEmpty;
}

class AboutValue {
  const AboutValue({required this.title, required this.description});
  final String title;
  final String description;
}

class ContactCopy {
  const ContactCopy({
    this.title = '',
    this.subtitle = '',
    this.email = '',
    this.phone = '',
    this.address = '',
    this.hours = '',
  });

  factory ContactCopy.fromJson(Map<String, dynamic> j) => ContactCopy(
        title: _str(j, 'title'),
        subtitle: _str(j, 'subtitle'),
        email: _str(j, 'email'),
        phone: _str(j, 'phone'),
        address: _str(j, 'address'),
        hours: _str(j, 'hours'),
      );

  final String title;
  final String subtitle;

  /// Several of these are blank on the live site. Each row hides itself rather than
  /// printing an empty label.
  final String email;
  final String phone;
  final String address;
  final String hours;
}

class BusinessFeature {
  const BusinessFeature({required this.title, required this.body});
  final String title;
  final String body;
}
