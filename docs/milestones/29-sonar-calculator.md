# 29 - Reproductive ultrasound calculator (حاسبة قياسات السونار التناسلي)

**Status:** live on the website and API since 2026-10-26 (client request, source file
`Baytara_sonar_v5.html`, "إصدار أمواج الحياة - V5.0"). The app screen ships with the next release.

## Goal

The client's standalone calculator, inside the website and the app, in Baytara's brand,
usable only with an account. It estimates gestational age from ultrasound measurements
for five species (cattle, buffalo, horses, sheep, goats) and the expected calving date.

## What the source does

- Inputs: species; up to seven measurements in mm: GSD (EV in horses), eye orbit, CRL,
  BPD, head length, trunk diameter, placentomes (not for horses); an optional case label.
- Each measurement entered gives its own age in days from a species-specific formula
  (linear, quadratic or square-root terms; the horse vesicle is piecewise; sheep and goat
  placentomes are capped at 32 mm). The result is the rounded average of those ages.
- Expected birth = today + (gestation length - age), with gestation lengths of 283
  (cattle), 310 (buffalo), 340 (horses) and 150 days (sheep, goats).
- A session list of results and a "copy report" button. Nothing is saved.

## Decisions

- **The formulas are the client's and are kept exactly.** They are ported once to the
  server and checked against the original JavaScript on a grid of inputs, including
  JavaScript's rounding of halves (`Math.round` rounds 0.5 up; Python's `round` does not).
- **Computed on the server, behind sign-in.** One implementation for site and app, and the
  account requirement is real: the formulas are not in any page a visitor can download.
- **Saved to the account.** Each calculation is kept as a case in the learner's history
  (case label, species, measurements, result, exam date), listed newest first, deletable
  one by one or all at once, and readable from the website or the app.

## Enhancements over the source (factual only; no new clinical thresholds)

- **Exam date.** Defaults to today; can be set back, so a scan recorded later gives the
  right expected date. The source always counted from the moment of typing.
- **The spread between measurements** (lowest and highest single estimate) is shown next
  to the average, so a vet sees at a glance whether the measurements agree.
- **An estimate beyond the species' gestation length is flagged** as impossible for that
  measurement (likely a typing error) rather than silently averaged in.
- **Days remaining and gestation length** shown with the expected date.
- **Input checks:** numbers only, greater than zero, at most 1000 mm; at least one needed.
- **Report** copy and WhatsApp share in the same plain format as the source.

## Acceptance check

- [x] Backend: 632 reference results produced by running the client's own script in Node
  (`tests/fixtures/gen_sonar_vectors.js`) all match `services/sonar.py` to the day;
  signed-out refused; history own-only; account deletion removes the saved cases. Full
  suite 1028 passed.
- [x] Website: `/tools/sonar` in the header; a visitor gets the sign-up gate and the page
  never calls the API. `src/pages/sonar.test.jsx` (3); suite 115 passed.
- [x] App: home card and Settings entry, signed-in route. `test/sonar_test.dart` (3);
  analyze clean; 272 passed.
- [x] Live: a throwaway account on baytara.app got [24, 43, 26, 32, 30, 33, 50], average 34,
  for cattle with every measurement at 3 mm; the client's script gives the same. The account
  and its case were then deleted. The page shows the sign-up gate to a visitor.
