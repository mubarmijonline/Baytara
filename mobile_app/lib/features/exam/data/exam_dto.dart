// The end-of-course exam, as the app sees it.
//
// One thing is deliberately absent from every shape here: which option is correct. The
// server strips it from the paper and marks the submission itself, so a determined reader
// of the response learns nothing. Anything that reintroduces an `isCorrect` on a question
// before submission has broken the exam.
class Exam {
  const Exam({
    required this.id,
    required this.passPercent,
    required this.questionCount,
    this.title,
    this.eligible = false,
    this.coursePercent = 0,
    this.attemptCount = 0,
    this.bestScorePercent,
    this.passed = false,
    this.timeLimitMinutes,
    this.showResults = false,
    this.paperToken,
    this.questions = const [],
    this.attempts = const [],
  });

  factory Exam.fromJson(Map<String, dynamic> j) => Exam(
        id: (j['id'] as num?)?.toInt() ?? 0,
        title: j['title'] as String?,
        passPercent: (j['pass_percent'] as num?)?.toInt() ?? 70,
        // The number this sitting asks, which is not the size of the bank when the exam
        // draws a subset.
        questionCount: (j['question_count'] as num?)?.toInt() ?? 0,
        // False until every lesson is watched. The paper is withheld until then, so an
        // empty `questions` on an ineligible exam is expected, not a failure.
        eligible: j['eligible'] as bool? ?? false,
        coursePercent: (j['course_percent'] as num?)?.toInt() ?? 0,
        attemptCount: (j['attempt_count'] as num?)?.toInt() ?? 0,
        bestScorePercent: (j['best_score_percent'] as num?)?.toInt(),
        passed: j['passed'] as bool? ?? false,
        timeLimitMinutes: (j['time_limit_minutes'] as num?)?.toInt(),
        showResults: j['show_results'] as bool? ?? false,
        // Ties a submission to this sitting: which questions were drawn and when. Sent
        // back untouched; the app never reads or builds one.
        paperToken: j['paper_token'] as String?,
        questions: [
          for (final q in (j['questions'] as List? ?? const []))
            ExamQuestion.fromJson(q as Map<String, dynamic>),
        ],
        attempts: [
          for (final a in (j['attempts'] as List? ?? const []))
            ExamAttempt.fromJson(a as Map<String, dynamic>),
        ],
      );

  final int id;
  final String? title;
  final int passPercent;
  final int questionCount;
  final bool eligible;
  final int coursePercent;
  final int attemptCount;
  final int? bestScorePercent;
  final bool passed;
  final int? timeLimitMinutes;
  final bool showResults;
  final String? paperToken;
  final List<ExamQuestion> questions;
  final List<ExamAttempt> attempts;

  bool get hasTimeLimit => (timeLimitMinutes ?? 0) > 0;
}

class ExamQuestion {
  const ExamQuestion({required this.id, required this.text, this.options = const []});

  factory ExamQuestion.fromJson(Map<String, dynamic> j) => ExamQuestion(
        id: (j['id'] as num?)?.toInt() ?? 0,
        text: j['text'] as String? ?? '',
        options: [
          for (final o in (j['options'] as List? ?? const []))
            ExamOption.fromJson(o as Map<String, dynamic>),
        ],
      );

  final int id;
  final String text;
  final List<ExamOption> options;
}

class ExamOption {
  const ExamOption({required this.id, required this.text});

  factory ExamOption.fromJson(Map<String, dynamic> j) => ExamOption(
        id: (j['id'] as num?)?.toInt() ?? 0,
        text: j['text'] as String? ?? '',
      );

  final int id;
  final String text;
}

class ExamAttempt {
  const ExamAttempt({
    required this.scorePercent,
    required this.correctCount,
    required this.questionCount,
    required this.passed,
    this.submittedAt,
  });

  factory ExamAttempt.fromJson(Map<String, dynamic> j) => ExamAttempt(
        scorePercent: (j['score_percent'] as num?)?.toInt() ?? 0,
        correctCount: (j['correct_count'] as num?)?.toInt() ?? 0,
        questionCount: (j['question_count'] as num?)?.toInt() ?? 0,
        passed: j['passed'] as bool? ?? false,
        submittedAt: DateTime.tryParse(j['submitted_at'] as String? ?? ''),
      );

  final int scorePercent;
  final int correctCount;
  final int questionCount;
  final bool passed;
  final DateTime? submittedAt;
}

/// What comes back from a submission: the mark, and the certificate when it is a pass.
class ExamResult {
  const ExamResult({
    required this.attempt,
    required this.passPercent,
    this.certificateSerial,
    this.review = const [],
  });

  factory ExamResult.fromJson(Map<String, dynamic> j) => ExamResult(
        attempt: ExamAttempt.fromJson(j['attempt'] as Map<String, dynamic>? ?? const {}),
        passPercent: (j['pass_percent'] as num?)?.toInt() ?? 70,
        certificateSerial: (j['certificate'] as Map?)?['serial'] as String?,
        // Only present when the examiner turned the marking on. An exam with unlimited
        // retries that hands back the answer key makes the next attempt a copying
        // exercise, so it is off by default and the app simply shows nothing.
        review: [
          for (final r in (j['review'] as List? ?? const []))
            ExamReviewRow.fromJson(r as Map<String, dynamic>),
        ],
      );

  final ExamAttempt attempt;
  final int passPercent;
  final String? certificateSerial;
  final List<ExamReviewRow> review;
}

class ExamReviewRow {
  const ExamReviewRow({
    required this.questionId,
    required this.isCorrect,
    this.correctOptionId,
    this.explanation,
  });

  factory ExamReviewRow.fromJson(Map<String, dynamic> j) => ExamReviewRow(
        questionId: (j['question_id'] as num?)?.toInt() ?? 0,
        isCorrect: j['is_correct'] as bool? ?? false,
        correctOptionId: (j['correct_option_id'] as num?)?.toInt(),
        explanation: j['explanation'] as String?,
      );

  final int questionId;
  final bool isCorrect;
  final int? correctOptionId;
  final String? explanation;
}
