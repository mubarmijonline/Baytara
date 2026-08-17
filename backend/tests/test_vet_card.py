"""Vet syndicate card parser self-check. Run: python -m tests.test_vet_card

Pure string work against the text Vision returns for a real card — no API calls, no
database, no app context.
"""
from datetime import date

from app.services.vet_card import (
    EGYPT_GOVERNORATES, governorate_agrees, normalize_digits, only_digits,
    parse_card, parse_national_id,
)

# The sample card, written the way Vision returns it: Arabic-Indic digits, label and
# value on one line, right-to-left text in logical order.
SAMPLE_BACK = """نقابة الأطباء البيطريين
الدكتور : محمد غريب محمد خضر
المهنة : طبيب بيطرى
رقم القيد : ٢٨٨٣٤ / البحيرة
رقم الترخيص: ٢٨٩٢٥
سارى حتى : ٢٠٢٨/٠٩
الرقم القومى : ٢٧٨١١٢٩١٨٠١٥٣٦
الأمين العام
د/ كريم زكى
"""

SAMPLE_FRONT = """اتحاد نقابات المهن الطبية
نقابة الأطباء البيطريين
Tel: 27949879
Fax: 27957280
info@egy-vet-synd.org
"""

TODAY = date(2026, 8, 16)


def demo():
    # ---- digits ----
    assert normalize_digits("٢٧٨١١٢٩١٨٠١٥٣٦") == "27811291801536"
    assert normalize_digits("۲۰۲۸/۰۹") == "2028/09"
    assert only_digits(" ٢٨٨٣٤ / البحيرة ") == "28834"
    assert normalize_digits("") == "" and only_digits(None) == ""

    # ---- national ID ----
    decoded, why = parse_national_id("٢٧٨١١٢٩١٨٠١٥٣٦")
    assert why is None, why
    assert decoded["national_id"] == "27811291801536"
    assert decoded["born"] == "1978-11-29"                 # 2 => 1900s, 781129
    assert decoded["governorate_code"] == "18"
    assert decoded["governorate"] == "البحيرة"
    assert EGYPT_GOVERNORATES["18"] == "البحيرة"

    for bad, reason in (
        ("2781129180153", "length"),        # 13 digits
        ("278112918015366", "length"),      # 15
        ("17811291801536", "century"),      # century digit 1
        ("27813291801536", "birth_date"),   # month 32
        ("27811299901536", "governorate"),  # code 99
        ("", "length"), (None, "length"),
    ):
        got, got_reason = parse_national_id(bad)
        assert got is None and got_reason == reason, (bad, got_reason)

    # a birth date in the future is not a birth date
    assert parse_national_id("39912319801536")[0] is None

    # ---- the whole card ----
    card = parse_card(SAMPLE_BACK, SAMPLE_FRONT, today=TODAY)
    f = card["fields"]
    assert card["complete"], f
    assert f["name"]["value"] == "محمد غريب محمد خضر"
    assert f["profession"]["ok"] and "بيطر" in f["profession"]["value"]
    assert f["registration_no"]["value"] == "28834"
    assert f["governorate"]["value"] == "البحيرة"
    assert f["license_no"]["value"] == "28925"
    assert f["expires_at"]["value"] == "2028-09-30"        # valid to month end
    assert f["national_id"]["value"] == "27811291801536"
    assert f["is_syndicate_card"]["ok"]

    # the ID's governorate and the one printed on the card are the same place
    assert governorate_agrees(f["national_id_decoded"], f["governorate"]["value"])
    assert not governorate_agrees(f["national_id_decoded"], "القاهرة")
    assert not governorate_agrees(None, "البحيرة")

    # ---- expiry ----
    expired = parse_card(SAMPLE_BACK.replace("٢٠٢٨/٠٩", "٢٠٢٤/٠٣"), today=TODAY)
    assert expired["fields"]["expires_at"]["problem"] == "expired"
    assert not expired["complete"]
    # the month it expires in is still valid, right to the last day
    edge = parse_card(SAMPLE_BACK.replace("٢٠٢٨/٠٩", "٢٠٢٦/٠٨"), today=TODAY)
    assert edge["fields"]["expires_at"]["ok"], edge["fields"]["expires_at"]

    # ---- another syndicate's card ----
    pharmacist = parse_card(SAMPLE_BACK.replace("طبيب بيطرى", "صيدلى"), today=TODAY)
    assert pharmacist["fields"]["profession"]["problem"] == "not_veterinarian"
    assert not pharmacist["complete"]

    # ---- unreadable card ----
    blank = parse_card("", today=TODAY)
    assert not blank["complete"]
    assert all(blank["fields"][k]["problem"] for k in
               ("name", "profession", "registration_no", "license_no", "expires_at", "national_id"))

    # ---- a photo of something else entirely ----
    other = parse_card("Tel: 27949879\ninfo@egy-vet-synd.org", today=TODAY)
    assert other["fields"]["is_syndicate_card"]["problem"] == "not_syndicate_card"

    print("vet card self-check OK")


def test_vet_card_parser():
    demo()


if __name__ == "__main__":
    demo()


# Real Vision output, captured from a card image. It hands back a different alphabet
# than the card prints — سارى حتى returns as ساری حتی with the Farsi yeh — and mixes
# Arabic-Indic ٢ with Extended Arabic-Indic ۲ inside one document.
VISION_REAL = (
    "نقابة الأطباء البيطريين\n"
    "الدكتور محمد غریب محمد خضر\n"
    "المهنة : طبيب بيطرى\n"
    "رقم القيد : ٢٨٨٣٤ / البحيرة\n"
    "رقم الترخيص: ٢٨٩٢٥\n"
    "ساری حتی : ۲۰۲۸/۰۹\n"
    "الرقم القومى : ۲۷۸۱۱۲۹۱۸۰۱٥٣٦"
)


def test_reads_what_vision_actually_returns():
    """Every field green on the real output, not on tidied-up text."""
    card = parse_card(VISION_REAL, "", today=TODAY)
    f = card["fields"]
    assert card["complete"], {k: v for k, v in f.items() if k != "national_id_decoded"}
    assert f["expires_at"]["value"] == "2028-09-30"     # the Farsi-yeh label still matched
    assert f["national_id"]["value"] == "27811291801536"  # mixed digit systems in one number
    assert f["registration_no"]["value"] == "28834"


def test_the_two_sides_may_be_uploaded_either_way_round():
    """A learner should not have to know which slot is which."""
    front = "اتحاد نقابات المهن الطبية\nنقابة الأطباء البيطريين\nTel: 27949879"
    right_way = parse_card(VISION_REAL, front, today=TODAY)
    swapped = parse_card(front, VISION_REAL, today=TODAY)
    assert right_way["complete"] and swapped["complete"]
    assert swapped["fields"]["national_id"]["value"] == "27811291801536"


def test_survives_the_ways_vision_reorders_a_right_to_left_card():
    """An angled photo does not come back as neat lines. Vision splits a label from
    its value, reverses a right-to-left line, and drops stamp text in between."""
    base = ("نقابة الأطباء البيطريين\n{name}{profession}{registration}"
            "رقم الترخيص: ٢٨٩٢٥\nساری حتی : ۲۰۲۸/۰۹\nالرقم القومى : ٢٧٨١١٢٩١٨٠١٥٣٦")
    layouts = {
        "split from label": base.format(
            name="الدكتور :\nمحمد غريب محمد خضر\n", profession="المهنة :\nطبيب بيطرى\n",
            registration="رقم القيد :\n٢٨٨٣٤\n/ البحيرة\n"),
        # the label lands after its number when the whole line comes back reversed
        "reversed line": base.format(
            name="الدكتور : محمد غريب محمد خضر\n", profession="المهنة : طبيب بيطرى\n",
            registration="البحيرة / ٢٨٨٣٤ : رقم القيد\n"),
        "stamp text between": base.format(
            name="الدكتور : محمد غريب محمد خضر\nEGYPTIAN VETERINARIANS\n",
            profession="المهنة : طبيب بيطرى\n", registration="رقم القيد : ٢٨٨٣٤ / البحيرة\n"),
    }
    for label, text in layouts.items():
        card = parse_card(text, "", today=TODAY)
        fields = card["fields"]
        assert card["complete"], (label, {k: v for k, v in fields.items() if k != "national_id_decoded"})
        # the registration is its own number, never the licence sitting on the next line
        assert fields["registration_no"]["value"] == "28834", (label, fields["registration_no"])
        assert fields["license_no"]["value"] == "28925", label
        assert fields["governorate"]["value"] == "البحيرة", label
