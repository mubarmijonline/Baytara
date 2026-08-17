"""Egyptian veterinary syndicate card (نقابة الأطباء البيطريين) reading and validation.

Same shape as instapay_ocr: a thin Vision wrapper lives there and is reused, while
everything here is pure so it can be tested offline against real card text.

The card prints every number in Arabic-Indic digits, so normalize_digits() runs first
and every pattern below matches ASCII.
"""
import re
from calendar import monthrange
from datetime import date

# ٠..٩ (Arabic-Indic) and ۰..۹ (Extended, used by some fonts) -> ASCII.
_DIGITS = {ord(c): str(i) for i, c in enumerate("٠١٢٣٤٥٦٧٨٩")}
_DIGITS.update({ord(c): str(i) for i, c in enumerate("۰۱۲۳۴۵۶۷۸۹")})

# Governorate codes as they appear in digits 8-9 of a national ID. The card prints the
# governorate in words beside رقم القيد, so the two are cross-checked against each other.
EGYPT_GOVERNORATES = {
    "01": "القاهرة", "02": "الإسكندرية", "03": "بورسعيد", "04": "السويس",
    "11": "دمياط", "12": "الدقهلية", "13": "الشرقية", "14": "القليوبية",
    "15": "كفر الشيخ", "16": "الغربية", "17": "المنوفية", "18": "البحيرة",
    "19": "الإسماعيلية", "21": "الجيزة", "22": "بني سويف", "23": "الفيوم",
    "24": "المنيا", "25": "أسيوط", "26": "سوهاج", "27": "قنا", "28": "أسوان",
    "29": "الأقصر", "31": "البحر الأحمر", "32": "الوادي الجديد", "33": "مطروح",
    "34": "شمال سيناء", "35": "جنوب سيناء", "88": "خارج الجمهورية",
}

# Vision hands back a different alphabet than the card prints. Observed on a real
# card: سارى حتى comes back as ساری حتی with the Farsi yeh (U+06CC), and كـ appears
# as ک. Folding these away first is what makes the labels matchable at all.
_LETTERS = str.maketrans({
    "ی": "ي", "ى": "ي", "ئ": "ي",          # yeh variants -> yeh
    "ک": "ك", "ڪ": "ك",                     # kaf variants -> kaf
    "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",  # hamzated alef -> alef
    "ة": "ه",                               # taa marbuta -> haa
    "ؤ": "و",
    "ـ": "",                                # tatweel, a decorative stretch
})
_MARKS = re.compile(r"[\u064B-\u0652\u0670\u200c\u200f\u200e]")


def fold_arabic(text):
    """One spelling for matching. Never shown to anyone — display keeps the original."""
    return _MARKS.sub("", (text or "").translate(_LETTERS))


# Patterns are written in folded form: نقابه not نقابة, بيطري not بيطرى.
VET_PROFESSION_RE = re.compile(r"طبيب\s*بيطري")
SYNDICATE_RE = re.compile(r"نقاب\w*\s*الاطباء|الاطباء\s*البيطري")

# The label and value are separated by a colon that Vision sometimes drops, and the
# value may sit on the next line.
NAME_RE = re.compile(r"الدكتور\s*[:：]?\s*(.+)")
PROFESSION_RE = re.compile(r"المهنه\s*[:：]?\s*(.+)")
REGISTRATION_RE = re.compile(r"رقم\s*القيد\s*[:：]?\s*(\d+)\s*/?\s*([^\d\n]*)")
LICENSE_RE = re.compile(r"رقم\s*الترخيص\s*[:：]?\s*(\d+)")
EXPIRY_RE = re.compile(r"ساري\s*حتي\s*[:：]?\s*(\d{4})\s*/\s*(\d{1,2})")
NATIONAL_ID_RE = re.compile(r"الرقم\s*القومي\s*[:：]?\s*(\d{14})")
ANY_14_RE = re.compile(r"(?<!\d)(\d{14})(?!\d)")
# Vision reorders right-to-left lines, so the number does not always follow its label
# on the same line. This is the fallback: the label, then the next run of digits.
REGISTRATION_LOOSE_RE = re.compile(r"رقم\s*القيد\D{0,20}(\d{3,})")
# ...and sometimes ahead of it, when the whole line comes back reversed. Tried before
# the forward fallback, which would otherwise walk on and grab the licence number.
REGISTRATION_REVERSED_RE = re.compile(r"(\d{3,})\D{0,20}رقم\s*القيد")

# Folded governorate names, longest first so "شمال سيناء" wins over "سيناء".
_FOLDED_GOVERNORATES = None


def _find_governorate(text):
    """The governorate printed anywhere on the card, returned canonically."""
    global _FOLDED_GOVERNORATES
    if _FOLDED_GOVERNORATES is None:
        _FOLDED_GOVERNORATES = sorted(
            ((fold_arabic(name), name) for name in EGYPT_GOVERNORATES.values()),
            key=lambda pair: -len(pair[0]))
    for folded, canonical in _FOLDED_GOVERNORATES:
        if folded and folded in text:
            return canonical
    return ""


def normalize_digits(text):
    """Arabic-Indic digits to ASCII. Everything downstream assumes ASCII."""
    return (text or "").translate(_DIGITS)


def only_digits(value):
    return re.sub(r"\D", "", normalize_digits(value or ""))


def parse_national_id(raw):
    """Decode an Egyptian national ID, or explain why it is not one.

    Layout: C YYMMDD GG SSSS X — century, birth date, governorate, serial, check.
    """
    digits = only_digits(raw)
    if len(digits) != 14:
        return None, "length"
    century = {"2": 1900, "3": 2000}.get(digits[0])
    if not century:
        return None, "century"
    year = century + int(digits[1:3])
    month, day = int(digits[3:5]), int(digits[5:7])
    if not 1 <= month <= 12:
        return None, "birth_date"
    try:
        born = date(year, month, day)
    except ValueError:
        return None, "birth_date"
    if born > date.today():
        return None, "birth_date"
    code = digits[7:9]
    if code not in EGYPT_GOVERNORATES:
        return None, "governorate"
    return {
        "national_id": digits,
        "born": born.isoformat(),
        "governorate_code": code,
        "governorate": EGYPT_GOVERNORATES[code],
    }, None


# The card's own labels. Text that is only a label is a column bleeding into a value.
_LABELS = ("الدكتور", "المهنه", "رقم القيد", "رقم الترخيص", "ساري حتي", "الرقم القومي",
           "الامين العام")


def _is_label(value):
    stripped = value.strip(" :：/\t")
    return any(stripped.startswith(label) for label in _LABELS)


def _field(value=None, ok=False, problem=None):
    return {"value": value, "ok": ok, "problem": problem}


def _expiry(year, month, today):
    """The card prints YYYY/MM, so it is valid to the last day of that month."""
    last = monthrange(year, month)[1]
    end = date(year, month, last)
    return end, end >= today


def parse_card(front_text, back_text="", today=None):
    """Read a card whichever way round the two photos were uploaded.

    The front is the side carrying the details — name, رقم القيد, الرقم القومى — and
    the back is the logo and contact side. Both are parsed as if each were the details
    side and the better reading wins, so a learner who swaps the two still gets read.
    """
    first = _read_side(front_text, back_text, today)
    second = _read_side(back_text, front_text, today)
    score = lambda report: sum(  # noqa: E731 — a one-line key, not a function worth naming
        1 for key, field in report["fields"].items()
        if key != "national_id_decoded" and field["ok"])
    return first if score(first) >= score(second) else second


def _read_side(details_text, other_text="", today=None):
    """One reading, treating details_text as the side carrying the details.

    Pure: `today` is injectable so the expiry test does not drift.
    """
    today = today or date.today()
    text = fold_arabic(normalize_digits(details_text or ""))
    front = fold_arabic(normalize_digits(other_text or ""))
    fields = {}

    name = NAME_RE.search(text)
    captured = name.group(1).strip() if name else ""
    # Vision sometimes returns the card's label column as one block, so the text after
    # a label is the next label rather than its value. Showing that back as the name
    # would be worse than admitting it could not be read.
    fields["name"] = _field(captured, True) if captured and not _is_label(captured) \
        else _field(problem="unreadable")

    # The phrase is what proves it, and showing the phrase found on the card beats
    # showing whatever happened to follow the label — which was the neighbouring
    # label often enough to surface as "Profession: رقم القيد".
    vet = VET_PROFESSION_RE.search(text)
    profession = PROFESSION_RE.search(text)
    captured = profession.group(1).strip() if profession else ""
    if vet:
        fields["profession"] = _field(vet.group(0).strip(), True)
    elif not captured or _is_label(captured):
        fields["profession"] = _field(problem="unreadable")
    else:
        # A pharmacist's or a dentist's syndicate card is not this one.
        fields["profession"] = _field(captured, False, "not_veterinarian")

    registration = (REGISTRATION_RE.search(text) or REGISTRATION_REVERSED_RE.search(text)
                    or REGISTRATION_LOOSE_RE.search(text))
    fields["registration_no"] = _field(registration.group(1), True) if registration \
        else _field(problem="unreadable")

    printed = (registration.group(2).strip(" :/\t") if registration and registration.lastindex and registration.lastindex > 1
               else "") or _find_governorate(text)
    fields["governorate"] = _field(printed, bool(printed), None if printed else "unreadable")

    license_no = LICENSE_RE.search(text)
    fields["license_no"] = _field(license_no.group(1), True) if license_no \
        else _field(problem="unreadable")

    expiry = EXPIRY_RE.search(text)
    if expiry:
        year, month = int(expiry.group(1)), int(expiry.group(2))
        if 1 <= month <= 12:
            end, live = _expiry(year, month, today)
            fields["expires_at"] = _field(end.isoformat(), live, None if live else "expired")
        else:
            fields["expires_at"] = _field(problem="unreadable")
    else:
        fields["expires_at"] = _field(problem="unreadable")

    # The label is the reliable anchor; a bare 14-digit run is the fallback for when
    # Vision drops the label but still reads the number.
    match = NATIONAL_ID_RE.search(text) or ANY_14_RE.search(text)
    if match:
        decoded, why = parse_national_id(match.group(1))
        fields["national_id"] = _field(match.group(1), bool(decoded), why)
        fields["national_id_decoded"] = decoded
    else:
        fields["national_id"] = _field(problem="unreadable")
        fields["national_id_decoded"] = None

    # Folding is for matching only. Once the ID has decoded and the two agree, the
    # governorate is shown and stored in its canonical spelling rather than the folded
    # one the matcher worked with — البحيرة, not البحيره.
    decoded = fields.get("national_id_decoded")
    if decoded and fields["governorate"]["ok"] and governorate_agrees(decoded, fields["governorate"]["value"]):
        fields["governorate"]["value"] = decoded["governorate"]

    # The other side is evidence that this is the right card at all; it carries no data.
    fields["is_syndicate_card"] = _field(
        True, bool(SYNDICATE_RE.search(text) or SYNDICATE_RE.search(front)),
        None if (SYNDICATE_RE.search(text) or SYNDICATE_RE.search(front)) else "not_syndicate_card",
    )

    checked = [key for key in fields if key != "national_id_decoded"]
    return {"fields": fields, "complete": all(fields[key]["ok"] for key in checked)}


def governorate_agrees(decoded, printed):
    """The governorate encoded in the ID against the one printed beside رقم القيد.

    Compared loosely: the card writes البحيرة and the table holds البحيرة, but Vision
    may return it with the article or stray punctuation attached.
    """
    if not decoded or not printed:
        return False
    expected = fold_arabic(decoded["governorate"]).replace("ال", "", 1)
    printed = fold_arabic(printed).strip().replace("ال", "", 1)
    return bool(printed) and (expected in printed or printed in expected)


def read_national_id(text):
    """Find a valid national ID in OCR text. The card prints it in Arabic-Indic digits
    and Vision often splits it across groups, so digits are normalised and the runs are
    tried in order until one decodes."""
    normalized = fold_arabic(normalize_digits(text or ""))
    labelled = NATIONAL_ID_RE.search(normalized)
    candidates = ([labelled.group(1)] if labelled else []) + ANY_14_RE.findall(normalized)
    # Vision sometimes spaces the number into groups; join everything and slide a window.
    joined = re.sub(r"\D", "", normalized)
    candidates += [joined[i:i + 14] for i in range(max(len(joined) - 13, 0))]
    for candidate in candidates:
        decoded, _ = parse_national_id(candidate)
        if decoded:
            return decoded
    return None
