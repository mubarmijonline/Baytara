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


def _field(value=None, ok=False, problem=None):
    return {"value": value, "ok": ok, "problem": problem}


def _expiry(year, month, today):
    """The card prints YYYY/MM, so it is valid to the last day of that month."""
    last = monthrange(year, month)[1]
    end = date(year, month, last)
    return end, end >= today


def parse_card(back_text, front_text="", today=None):
    """Read a card whichever way round the two photos were uploaded.

    Both sides are parsed as if each were the data side and the better reading wins.
    Nobody should have to know which slot is which, and getting it wrong used to
    report every field as unreadable.
    """
    first = _read_side(back_text, front_text, today)
    second = _read_side(front_text, back_text, today)
    score = lambda report: sum(  # noqa: E731 — a one-line key, not a function worth naming
        1 for key, field in report["fields"].items()
        if key != "national_id_decoded" and field["ok"])
    return first if score(first) >= score(second) else second


def _read_side(back_text, front_text="", today=None):
    """One reading, treating back_text as the side carrying the data.

    Pure: `today` is injectable so the expiry test does not drift.
    """
    today = today or date.today()
    text = fold_arabic(normalize_digits(back_text or ""))
    front = fold_arabic(normalize_digits(front_text or ""))
    fields = {}

    name = NAME_RE.search(text)
    fields["name"] = _field(name.group(1).strip(), True) if name and name.group(1).strip() \
        else _field(problem="unreadable")

    profession = PROFESSION_RE.search(text)
    value = profession.group(1).strip() if profession else None
    if not value:
        fields["profession"] = _field(problem="unreadable")
    elif not VET_PROFESSION_RE.search(value):
        # A pharmacist's or a dentist's syndicate card is not this one.
        fields["profession"] = _field(value, False, "not_veterinarian")
    else:
        fields["profession"] = _field(value, True)

    registration = REGISTRATION_RE.search(text)
    if registration:
        fields["registration_no"] = _field(registration.group(1), True)
        governorate = registration.group(2).strip(" :/\t") or None
        fields["governorate"] = _field(governorate, bool(governorate),
                                       None if governorate else "unreadable")
    else:
        fields["registration_no"] = _field(problem="unreadable")
        fields["governorate"] = _field(problem="unreadable")

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

    # The front is evidence that this is the right card at all; it carries no data.
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
