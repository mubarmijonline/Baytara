"""Mobile normalizer self-check. Run: python -m tests.test_phone

No app or database needed — this is pure string work.
"""
from app.services.phone import normalize_mobile


def demo():
    # Egyptian rows as they are already stored, in every spelling people type.
    for written in ("01024527770", "+201024527770", "00201024527770",
                    "0102 452 7770", "+20 (010) 2452-7770", "+20010 2452 7770"):
        assert normalize_mobile(written) == "+201024527770", written

    # Every Egyptian mobile prefix, and no landline.
    for prefix in ("10", "11", "12", "15"):
        assert normalize_mobile(f"0{prefix}12345678") == f"+20{prefix}12345678"
    assert normalize_mobile("0221234567") is None       # Cairo landline
    assert normalize_mobile("01312345678") is None      # 013 is not an operator

    # Gulf mobiles, which must carry their country code: a bare 05xxxxxxxx is
    # both a Saudi and an Emirati number and there is no way to tell.
    assert normalize_mobile("+966512345678") == "+966512345678"
    assert normalize_mobile("00971501234567") == "+971501234567"
    assert normalize_mobile("+965 51234567") == "+96551234567"
    assert normalize_mobile("+974 33123456") == "+97433123456"
    assert normalize_mobile("+973 36123456") == "+97336123456"
    assert normalize_mobile("+968 91234567") == "+96891234567"
    assert normalize_mobile("0512345678") is None       # bare Gulf number

    # Wrong length either way, and the 14-digit row already in production.
    assert normalize_mobile("+9665123456") is None
    assert normalize_mobile("+9665123456789") is None
    assert normalize_mobile("02120674538428") is None

    # Junk in, None out — never an exception on user input.
    for junk in ("", "   ", "not a phone", "+", "00", None, 12345, "+201024527770123"):
        assert normalize_mobile(junk) is None, junk

    print("phone self-check OK")


if __name__ == "__main__":
    demo()
