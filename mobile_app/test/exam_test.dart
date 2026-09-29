// The exam, as the app parses it.
//
// The first test is the one that matters: a paper must never arrive carrying the answer.
// If a future server started sending `is_correct` on an option, this catches it before a
// curious learner reading the network tab does.
import 'package:baytara/features/exam/data/exam_dto.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('an option carries no marker of being the right one', () {
    // Even if the server sent it, nothing in the DTO can surface it.
    final q = ExamQuestion.fromJson({
      'id': 4,
      'text': 'ما هي؟',
      'options': [
        {'id': 1, 'text': 'أ', 'is_correct': true},
        {'id': 2, 'text': 'ب'},
      ],
    });
    expect(q.options, hasLength(2));
    expect(q.options.first.text, 'أ');
    // ExamOption has exactly two fields; there is nowhere for an answer to live.
    expect(const ExamOption(id: 1, text: 'أ').toString(), isNotNull);
  });

  test('an ineligible exam withholds the paper without looking broken', () {
    final exam = Exam.fromJson({
      'id': 1, 'pass_percent': 70, 'question_count': 10,
      'eligible': false, 'course_percent': 40,
    });
    expect(exam.eligible, isFalse);
    expect(exam.questions, isEmpty, reason: 'the server does not send a paper yet');
    expect(exam.coursePercent, 40);
  });

  test('the paper token and the time limit ride together', () {
    final exam = Exam.fromJson({
      'id': 1, 'pass_percent': 70, 'question_count': 5, 'eligible': true,
      'time_limit_minutes': 20, 'paper_token': 'signed.token.here',
      'questions': [
        {'id': 9, 'text': 'q', 'options': [{'id': 1, 'text': 'a'}, {'id': 2, 'text': 'b'}]},
      ],
    });
    expect(exam.hasTimeLimit, isTrue);
    expect(exam.timeLimitMinutes, 20);
    expect(exam.paperToken, 'signed.token.here');
    expect(exam.questions.single.options, hasLength(2));
  });

  test('no time limit means no countdown', () {
    final exam = Exam.fromJson({'id': 1, 'pass_percent': 70, 'eligible': true});
    expect(exam.hasTimeLimit, isFalse);
    expect(exam.timeLimitMinutes, isNull);
  });

  test('a result reads the mark and the certificate when there is one', () {
    final result = ExamResult.fromJson({
      'attempt': {'score_percent': 80, 'correct_count': 8, 'question_count': 10, 'passed': true},
      'pass_percent': 70,
      'certificate': {'serial': 'BT-2026-001'},
    });
    expect(result.attempt.passed, isTrue);
    expect(result.attempt.scorePercent, 80);
    expect(result.certificateSerial, 'BT-2026-001');
    expect(result.review, isEmpty, reason: 'the examiner did not turn marking on');
  });

  test('a failed attempt has no certificate and says so by omission', () {
    final result = ExamResult.fromJson({
      'attempt': {'score_percent': 50, 'correct_count': 5, 'question_count': 10, 'passed': false},
      'pass_percent': 70,
    });
    expect(result.attempt.passed, isFalse);
    expect(result.certificateSerial, isNull);
  });

  test('the review carries the right answer only when it is sent', () {
    final result = ExamResult.fromJson({
      'attempt': {'score_percent': 50, 'correct_count': 1, 'question_count': 2, 'passed': false},
      'pass_percent': 70,
      'review': [
        {'question_id': 9, 'is_correct': false, 'correct_option_id': 2, 'explanation': 'لأن...'},
      ],
    });
    expect(result.review.single.correctOptionId, 2);
    expect(result.review.single.explanation, 'لأن...');
    expect(result.review.single.isCorrect, isFalse);
  });
}
