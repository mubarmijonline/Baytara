# 21 — The exam, wherever the person is

**Status:** done and live. Backend exam suite 25 tests, app 262 tests, website 103 tests.
Migration applied; API, website, admin and instructor portals deployed.

## What was actually missing

The exam was built and correct, and had two holes that were surfaces rather than bugs:

1. **The instructor portal had no exam screen at all.** The endpoints existed and were
   ownership-checked (`/instructor/courses/<cid>/exam` and the question CRUD), but nothing
   in `frontend/instructor/src` consumed them. An instructor could not write the exam for
   their own course; an admin had to type it for them.
2. **The app had no exam.** Not one reference in `mobile_app/lib`. A student who watched
   every lesson on their phone reached 100% and then could never earn the certificate,
   because the certificate needs a passing attempt and there was no way to make one. On an
   exam-bearing course they got the attendance certificate and nothing else, silently.

## The options an examiner now has

Added, on top of the pass mark and publish switch that already existed:

- **Time limit**, in minutes, optional.
- **Questions per attempt** — draw N at random from the bank, optional. This is the usual
  reason an examiner writes forty questions and asks ten: the paper differs per sitting.
- **Show the marking after submitting**, off by default. On an exam with unlimited
  retries, handing back the answer key turns the next attempt into a copying exercise, so
  turning it on is a decision rather than a default.
- **Per-question explanation**, shown only with the marking and never part of the paper.

Publishing refuses a draw larger than the bank. Otherwise the examiner sets a
twenty-question paper, candidates sit six, and nothing says so.

## The signed paper

A time limit cannot be enforced from the request body, and neither can a random draw: the
server has to know **which** questions this candidate was shown and **when** they were
handed over, and the one party it cannot ask is the candidate.

So the paper goes out with a token signed with the application secret, carrying the drawn
question ids and an issue time (`services/exam_paper.py`). The submission hands it back.
It is stateless on purpose — no table to clean up and nothing leaked by an abandoned
attempt — and it is what makes marking correct: **a sitting is marked against the questions
it asked**, not against the whole bank, which would count every undrawn question wrong.

The countdown in the browser and in the app is a courtesy. The token is the rule.

An exam with neither a limit nor a draw is still markable from the bank alone, so a client
that sends no token is answered rather than refused. That is what keeps existing exams
working through the change.

## Parity

Comparing the website's routes against the app's turned up four gaps, all now closed:

- `/courses/:slug/exam` — the app had no exam screen. It now has one: the paper, a
  countdown when there is a limit, auto-submit when it runs out, the result, and the
  marking when the examiner allows it.
- `/terms`, `/refund`, `/delivery` — the three policy pages the site gained. They open on
  the website from app settings rather than being reimplemented natively. The app already
  keeps a local copy of the privacy policy, and adding three more legal texts to maintain
  in two places is the drift the support-address constant was just consolidated to avoid.
  A link to a policy is not a purchase link, so Guideline 3.1.1 does not reach it.
- `/completion-certificates/:serial` — there are **two** certificates, achievement and
  attendance, on two endpoints. The app asked only the first, so a completion serial read
  as "not found". Verification now falls through from one to the other, so a holder who
  does not know which kind they have gets an answer either way.

## Verified against the live API

The three new options round-trip through `PUT /admin/courses/<id>/exam`, a 9999-minute
limit is refused with `invalid_time_limit`, and clearing them returns null rather than
zero.
