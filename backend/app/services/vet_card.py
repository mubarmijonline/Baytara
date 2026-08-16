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

VET_PROFESSION_RE = re.compile(r"طبيب\s*بيطر[يى]")
SYNDICATE_RE = re.compile(r"نقابة\s*الأطباء\s*البيطر")

# Vision returns the label and the value with the colon and spacing varying, and the
# Arabic label itself is sometimes split across lines.
NAME_RE = re.compile(r"الدكتور\s*[:：]?\s*(.+)")
PROFESSION_RE = re.compile(r"المهنة\s*[:：]?\s*(.+)")
REGISTRATION_RE = re.compile(r"رقم\s*القيد\s*[:：]?\s*(\d+)\s*/?\s*([^\d\n]*)")
LICENSE_RE = re.compile(r"رقم\s*الترخيص\s*[:：]?\s*(\d+)")
EXPIRY_RE = re.compile(r"سار[يى]\s*حتى\s*[:：]?\s*(\d{4})\s*/\s*(\d{1,2})")
NATIONAL_ID_RE = re.compile(r"الرقم\s*القوم[يى]\s*[:：]?\s*(\d{14})")
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
    """Read a card. Returns {fields: {...}, complete: bool} with a verdict per field.

    Pure: `today` is injectable so the expiry test does not drift.
    """
    today = today or date.today()
    text = normalize_digits(back_text or "")
    front = normalize_digits(front_text or "")
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
    expected = decoded["governorate"]
    printed = printed.strip().replace("ال", "", 1)
    return expected.replace("ال", "", 1) in printed or printed in expected


def read_national_id(text):
    """Find a valid national ID in OCR text. The card prints it in Arabic-Indic digits
    and Vision often splits it across groups, so digits are normalised and the runs are
    tried in order until one decodes."""
    normalized = normalize_digits(text or "")
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
