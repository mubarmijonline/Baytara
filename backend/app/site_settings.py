"""Defaults, localization, and validation for editable public-site content."""

from copy import deepcopy


def _text(ar, en):
    return {"ar": ar, "en": en}


SITE_SETTING_DEFAULTS = {
    "header": {
        "brand": _text("بيطرة", "Baytara"),
        "welcome": _text(
            "مرحباً بك في منصة التعلّم البيطري الأولى عربياً",
            "Welcome to the leading Arabic veterinary learning platform",
        ),
        "app_label": _text("تحميل التطبيق", "Download the app"),
        "help_label": _text("المساعدة", "Help"),
    },
    "hero": {
        "eyebrow": _text("منصة التعلّم البيطري الأولى عربياً", "Veterinary learning, built for the Arab world"),
        "title": _text("تعلّم من نخبة الأطباء البيطريين في العالم العربي", "Learn from leading veterinarians across the Arab world"),
        "subtitle": _text(
            "دورات متخصصة في الطب البيطري والإنتاج الحيواني والتشخيص والجراحة، بمحتوى عربي أصيل من خبراء حقيقيين.",
            "Specialist veterinary, animal production, diagnostics, and surgery courses from trusted experts.",
        ),
        "primary_cta": _text("ابدأ التعلّم مجاناً", "Start learning free"),
        "secondary_cta": _text("شاهد كيف تعمل", "See how it works"),
        "featured_label": _text("دورة مميّزة", "Featured course"),
        "featured_title": _text("جراحة الحيوانات الصغيرة", "Small animal surgery"),
    },
    "home": {
        "featured_title": _text("الدورات المميّزة", "Featured courses"),
        "new_title": _text("أحدث الدورات", "Newest courses"),
        "categories_title": _text("تعلّم حسب التخصص", "Learn by specialty"),
        "testimonials_title": _text("ماذا يقول مجتمع بيطرة", "What the Baytara community says"),
    },
    "stats": [
        {"num": "+120", "label": _text("دورة متخصصة", "Specialist courses")},
        {"num": "+45", "label": _text("خبير ومدرب", "Experts and instructors")},
        {"num": "+8,000", "label": _text("متعلم", "Learners")},
        {"num": "4.8/5", "label": _text("متوسط التقييم", "Average rating")},
    ],
    "testimonials": [
        {
            "name": _text("د. أحمد محمد", "Dr Ahmed Mohamed"),
            "role": _text("طبيب بيطري", "Veterinarian"),
            "quote": _text("محتوى عملي ومفيد ساعدني في تطوير مهاراتي.", "Practical content that helped me develop my skills."),
        },
    ],
    "about": {
        "title": _text("من نحن", "About us"),
        "body": _text(
            "بيطرة منصة تعليمية واستشارية متخصّصة في الطب البيطري والإنتاج الحيواني، تجمع نخبة الخبراء العرب في مكان واحد.",
            "Baytara is a specialist veterinary and animal-production learning platform bringing trusted Arab experts together.",
        ),
        "values": [
            {"title": _text("رسالتنا", "Our mission"), "description": _text("إتاحة المعرفة البيطرية الاحترافية للجميع.", "Make professional veterinary knowledge accessible.")},
            {"title": _text("رؤيتنا", "Our vision"), "description": _text("أن نكون المرجع الأول للتعلّم البيطري عربياً.", "Become the leading Arabic veterinary learning reference.")},
            {"title": _text("قيمنا", "Our values"), "description": _text("المصداقية العلمية وجودة المحتوى وسهولة الوصول.", "Scientific integrity, quality, and accessibility.")},
        ],
    },
    "business": {
        "eyebrow": _text("بيطرة للأعمال", "Baytara for Business"),
        "title": _text("استثمر في نمو فريقك الطبي", "Invest in your clinical team's growth"),
        "body": _text("منصة تدريب متكاملة للعيادات والمزارع مع محتوى احترافي وتقارير أداء.", "A complete training platform for clinics and farms, with professional content and performance reporting."),
        "primary_cta": _text("اطلب عرضاً تجريبياً", "Request a demo"),
        "secondary_cta": _text("تحدث مع مختص", "Talk to a specialist"),
        "stats": [],
        "features": [],
        "logos": [],
        "trust": _text("موثوق به من مؤسسات الرعاية الحيوانية", "Trusted by animal-care organizations"),
    },
    "contact": {
        "title": _text("تواصل معنا", "Contact us"),
        "subtitle": _text("فريقنا جاهز لمساعدتك وسنعود إليك في أقرب وقت.", "Our team is ready to help and will respond as soon as possible."),
        "email": "hello@baytara.app",
        "phone": "",
        "address": _text("", ""),
        "hours": _text("", ""),
    },
    "socials": {
        "facebook": "",
        "instagram": "",
        "youtube": "",
        "whatsapp": "",
    },
    "footer": {
        "tagline": _text(
            "منصة التعلّم البيطري الأولى في العالم العربي بمحتوى عربي أصيل من نخبة الخبراء.",
            "The Arab world's veterinary learning platform, with original content from trusted experts.",
        ),
        "copyright": _text("© 2026 بيطرة. جميع الحقوق محفوظة.", "© 2026 Baytara. All rights reserved."),
    },
}

VALIDATION_SCHEMAS = deepcopy(SITE_SETTING_DEFAULTS)
VALIDATION_SCHEMAS["business"]["stats"] = [
    {"num": "", "label": _text("", "")},
]
VALIDATION_SCHEMAS["business"]["features"] = [
    {
        "icon": "",
        "title": _text("", ""),
        "description": _text("", ""),
        "desc": _text("", ""),
    },
]
VALIDATION_SCHEMAS["business"]["logos"] = [
    {"name": "", "url": ""},
]

LOCALIZED_KEYS = frozenset(("ar", "en"))


def _is_localized(value):
    return isinstance(value, dict) and set(value).issubset(LOCALIZED_KEYS) and bool(value)


def _merge(default, saved):
    if isinstance(default, dict) and set(default) == LOCALIZED_KEYS:
        if isinstance(saved, str):
            return {"ar": saved, "en": ""}
        if isinstance(saved, dict):
            merged = deepcopy(default)
            merged.update(saved)
            return merged
        return deepcopy(saved)
    if isinstance(default, dict) and isinstance(saved, dict):
        merged = deepcopy(default)
        for key, value in saved.items():
            merged[key] = _merge(default[key], value) if key in default else deepcopy(value)
        return merged
    return deepcopy(saved)


def _merged_settings(rows):
    merged = deepcopy(SITE_SETTING_DEFAULTS)
    for key, value in rows.items():
        merged[key] = _merge(merged[key], value) if key in merged else deepcopy(value)
    return merged


def admin_settings(rows):
    """Return raw bilingual settings with current-design defaults filled in."""
    return _merged_settings(rows)


def localize(value, language):
    if _is_localized(value):
        return value.get(language) or value.get("ar") or value.get("en") or ""
    if isinstance(value, dict):
        return {key: localize(item, language) for key, item in value.items()}
    if isinstance(value, list):
        return [localize(item, language) for item in value]
    return value


def public_settings(rows, language):
    """Merge defaults, remove credentials, and localize the public response."""
    visible = _without_secrets(rows)
    return localize(_merged_settings(visible), language if language in LOCALIZED_KEYS else "ar")


def _without_secrets(value):
    if isinstance(value, dict):
        return {
            key: _without_secrets(item)
            for key, item in value.items()
            if not key.startswith("secret_")
        }
    if isinstance(value, list):
        return [_without_secrets(item) for item in value]
    return deepcopy(value)


def _validate_localized(value, path, errors):
    if isinstance(value, str):
        return
    if not isinstance(value, dict):
        errors.append(f"invalid_{path}")
        return
    if not value or not set(value).issubset(LOCALIZED_KEYS):
        errors.append(f"invalid_{path}")
        return
    for language in LOCALIZED_KEYS:
        if language in value and not isinstance(value[language], str):
            errors.append(f"invalid_{path}_{language}")


def _validate_against(value, schema, path, errors):
    if isinstance(schema, dict) and set(schema) == LOCALIZED_KEYS:
        _validate_localized(value, path, errors)
        return
    if isinstance(schema, dict):
        if not isinstance(value, dict):
            errors.append(f"invalid_{path}")
            return
        for key, item in value.items():
            if key not in schema:
                errors.append(f"invalid_{path}_{key}")
            else:
                _validate_against(item, schema[key], f"{path}_{key}", errors)
        return
    if isinstance(schema, list):
        if not isinstance(value, list):
            errors.append(f"invalid_{path}")
            return
        item_schema = schema[0] if schema else None
        if item_schema is not None:
            for index, item in enumerate(value):
                _validate_against(item, item_schema, f"{path}_{index}", errors)
        return
    if value is not None and not isinstance(value, type(schema)):
        errors.append(f"invalid_{path}")


def _validate_nested_secrets(value, path, errors):
    if isinstance(value, dict):
        for key, item in value.items():
            child_path = f"{path}_{key}"
            if key.startswith("secret_"):
                errors.append(f"invalid_{child_path}")
            else:
                _validate_nested_secrets(item, child_path, errors)
    elif isinstance(value, list):
        for index, item in enumerate(value):
            _validate_nested_secrets(item, f"{path}_{index}", errors)


def validate_settings_payload(payload):
    """Return a normalized payload and stable validation errors."""
    if not isinstance(payload, dict):
        return {}, ["object_required"]
    errors = []
    for key, value in payload.items():
        if not isinstance(key, str):
            errors.append("invalid_key")
            continue
        if key.startswith("secret_") and value is not None and not isinstance(value, str):
            errors.append(f"invalid_{key}")
        elif key in VALIDATION_SCHEMAS:
            _validate_against(value, VALIDATION_SCHEMAS[key], key, errors)
        _validate_nested_secrets(value, key, errors)
    return deepcopy(payload), list(dict.fromkeys(errors))
