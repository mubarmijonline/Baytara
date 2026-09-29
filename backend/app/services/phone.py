"""Mobile-number validation for the countries Baytara sells into.

The number is burnt into the video watermark, so a wrong one weakens content
protection as much as a missing one — "01" and a guess used to pass.

Numbers are stored canonically in E.164 so two spellings of the same line cannot
look like two different people in a watermark or an InstaPay receipt.
"""

import re

# country code -> (mobile national prefixes, national significant number length)
MOBILE_RULES = {
    "20": (("10", "11", "12", "15"), 10),   # Egypt
    "966": (("5",), 9),                     # Saudi Arabia
    "971": (("5",), 9),                     # United Arab Emirates
    "965": (("5", "6", "9"), 8),            # Kuwait
    "974": (("3", "5", "6", "7"), 8),       # Qatar
    "973": (("3", "6"), 8),                 # Bahrain
    "968": (("7", "9"), 8),                 # Oman
}

# A bare 01xxxxxxxxx is Egyptian — that is how every existing row is written.
# Gulf mobiles are 5xxxxxxxx in both SA and AE, so a bare Gulf national number
# cannot be told apart from its neighbour's: those must carry a country code.
DEFAULT_COUNTRY = "20"


def normalize_mobile(raw):
    """Return the number as +<cc><nsn>, or None when it is not a mobile we accept."""
    if not isinstance(raw, str):
        return None
    digits = re.sub(r"\D", "", raw)          # drops +, spaces, dashes, parentheses
    if not digits:
        return None
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0"):
        digits = DEFAULT_COUNTRY + digits[1:]

    for code, (prefixes, length) in MOBILE_RULES.items():
        if not digits.startswith(code):
            continue
        national = digits[len(code):]
        # Some people keep the trunk 0 after the country code (+20 010…).
        if national.startswith("0"):
            national = national[1:]
        if len(national) == length and national.startswith(prefixes):
            return "+" + code + national
    return None
