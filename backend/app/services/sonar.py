"""Gestational age from reproductive ultrasound measurements (milestone 29).

The formulas are the client's, from `docs/reference/Baytara_sonar_v6_2.html` ("إصدار أمواج
الحياة - V6.2"; V5 plus dogs and cats, the five earlier species unchanged), copied
coefficient for coefficient. Do not "improve" them here: a change is the client's
call, and tests/test_sonar.py checks this file against the original JavaScript.

Each measurement entered gives its own age in days; the estimate is the rounded mean of
those. Everything else in this module (the spread, the impossible-estimate flag, the
exam date) is presentation added around the source and changes no number it produced.
"""
import math
from datetime import date, timedelta

SPECIES = ("bovine", "buffalo", "equine", "ovine", "caprine", "canine_small", "canine_large", "feline")
# Dogs and cats: measured on four things only (ICC, CRL, BPD, BD), and aged in weeks.
SMALL_ANIMALS = ("canine_small", "canine_large", "feline")
MEASURES = ("vesicle", "eye_orbit", "crl", "bpd", "hl", "trunk", "placentome")
# Gestation length in days, as the source uses for the expected date.
GESTATION_DAYS = {"bovine": 283, "buffalo": 310, "equine": 340, "ovine": 150, "caprine": 150,
                  "canine_small": 63, "canine_large": 63, "feline": 65}
MAX_MM = 1000


def js_round(x):
    """JavaScript's Math.round: halves go up (2.5 -> 3, -2.5 -> -2). Python's round()
    sends halves to the even neighbour, which would move some results by a day."""
    return math.floor(x + 0.5)


def _quad(a, b, c):
    return lambda v: a + b * v + c * v * v


def _sqrt_lin(a, b, c):
    return lambda v: a + b * math.sqrt(v) + c * v


def _lin(a, b):
    return lambda v: a + b * v


def _equine_vesicle(v):
    if v <= 24:
        return 9 + 0.32 * v
    if v <= 28:
        return 17 + (v - 24) * 2.0
    return 25 + (v - 28) * 0.52


FORMULAS = {
    "bovine": {
        "vesicle": _lin(22.5, 0.55), "eye_orbit": _quad(27, 5.2, 0.065),
        "crl": _sqrt_lin(21, 2.1, 0.37), "bpd": _lin(24.5, 2.42), "hl": _lin(26, 1.38),
        "trunk": _lin(28, 1.62), "placentome": _lin(42, 2.65),
    },
    "buffalo": {
        "vesicle": _lin(24.5, 0.58), "eye_orbit": _quad(30, 5.6, 0.07),
        "crl": _sqrt_lin(23, 2.2, 0.38), "bpd": _lin(27, 2.58), "hl": _lin(29, 1.48),
        "trunk": _lin(30, 1.72), "placentome": _lin(45, 2.85),
    },
    "equine": {
        "vesicle": _equine_vesicle, "eye_orbit": _quad(22, 5.3, 0.05),
        "crl": _sqrt_lin(21, 1.6, 0.36), "bpd": _lin(25, 2.32), "hl": _lin(26, 1.35),
        "trunk": _lin(26, 1.52),
    },
    "ovine": {
        "vesicle": _lin(17, 0.55), "eye_orbit": _quad(20, 5.2, 0.055),
        "crl": _sqrt_lin(18.5, 1.55, 0.31), "bpd": _lin(20.5, 2.1), "hl": _lin(21, 1.35),
        "trunk": _lin(22, 1.62), "placentome": lambda v: 18 + 1.95 * min(v, 32),
    },
    "caprine": {
        "vesicle": _lin(18, 0.56), "eye_orbit": _quad(22, 5.4, 0.06),
        "crl": _sqrt_lin(19.5, 1.55, 0.32), "bpd": _lin(21.5, 2.18), "hl": _lin(22, 1.4),
        "trunk": _lin(23, 1.62), "placentome": lambda v: 19 + 2.0 * min(v, 32),
    },
    # V6.2. For dogs and cats `vesicle` is the inner chorionic cavity (ICC) and `trunk` the
    # body/abdominal diameter (BD); eye orbit, head length and placentomes do not apply.
    "canine_small": {
        "vesicle": _lin(18.5, 0.75), "crl": _lin(24.5, 0.48), "bpd": _lin(24.7, 1.63),
        "trunk": _lin(23.5, 0.85),
    },
    "canine_large": {
        "vesicle": _lin(19.66, 0.629), "crl": _lin(24.64, 0.454), "bpd": _lin(21.08, 1.488),
        "trunk": _quad(22.89, 0.78, -0.0018),
    },
    "feline": {
        "vesicle": _lin(14.23, 0.858), "crl": _lin(21.8, 0.51), "bpd": _lin(25.1, 1.56),
        "trunk": _lin(22.65, 0.98),
    },
}


class SonarInputError(ValueError):
    """Carries a machine-readable code and, when it is about one field, that field."""

    def __init__(self, code, field=None):
        super().__init__(code)
        self.code = code
        self.field = field


def clean_measures(species, raw):
    """{measure: positive float} from untrusted input, or SonarInputError.

    Zero, blank and missing all mean "not measured", as in the source. A measurement the
    species does not use (placentomes in a horse; eye orbit, head length or placentomes in
    a dog or cat) is ignored, as the source ignores it.
    """
    if species not in SPECIES:
        raise SonarInputError("bad_species", "species")
    raw = raw if isinstance(raw, dict) else {}
    out = {}
    for name in MEASURES:
        value = raw.get(name)
        if value in (None, "", 0):
            continue
        if isinstance(value, bool):
            raise SonarInputError("bad_number", name)
        try:
            number = float(value)
        except (TypeError, ValueError):
            raise SonarInputError("bad_number", name) from None
        if not math.isfinite(number) or number < 0 or number > MAX_MM:
            raise SonarInputError("out_of_range", name)
        if number == 0 or name not in FORMULAS[species]:
            continue
        out[name] = number
    if not out:
        raise SonarInputError("no_measurements")
    return out


def estimate(species, measures, exam_date=None):
    """The result for already-cleaned measures. Ages are whole days, as in the source."""
    exam_date = exam_date or date.today()
    gestation = GESTATION_DAYS[species]
    per_measure = []
    for name in MEASURES:
        if name not in measures:
            continue
        age = js_round(FORMULAS[species][name](measures[name]))
        per_measure.append({"measure": name, "mm": measures[name], "age_days": age,
                            # An age past full term cannot be right for that measurement.
                            "beyond_term": age > gestation})
    ages = [m["age_days"] for m in per_measure]
    age = js_round(sum(ages) / len(ages))
    remaining = gestation - age
    return {
        "species": species,
        "age_days": age,
        # Months for the large animals, weeks for dogs and cats, as the source shows them.
        "age_unit": "weeks" if species in SMALL_ANIMALS else "months",
        "months": age // 30,
        "extra_days": age % 30,
        "weeks": age // 7,
        "week_days": age % 7,
        "per_measure": per_measure,
        "range_days": [min(ages), max(ages)],
        "gestation_days": gestation,
        "days_remaining": max(remaining, 0),
        "at_term": remaining <= 0,
        "exam_date": exam_date.isoformat(),
        "expected_birth": (exam_date + timedelta(days=remaining)).isoformat() if remaining > 0 else None,
    }
