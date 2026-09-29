// Sitting the end-of-course exam.
//
// Three states in one screen, because they are the same thing at different moments: not
// yet eligible (the course is unfinished), the paper, and the result.
//
// The countdown here is a courtesy. The rule is the signed paper token the server issued
// with the questions: a submission that arrives after the limit is refused whatever this
// clock says, so stopping it buys nobody anything.
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../application/exam_providers.dart';
import '../data/exam_dto.dart';

class ExamScreen extends ConsumerStatefulWidget {
  const ExamScreen({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<ExamScreen> createState() => _ExamScreenState();
}

class _ExamScreenState extends ConsumerState<ExamScreen> {
  final Map<int, int> _answers = {};
  ExamResult? _result;
  bool _submitting = false;
  String? _error;
  bool _confirmedPartial = false;

  Timer? _timer;
  int? _remaining;
  String? _timedToken;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  /// Starts the clock once, for the paper that arrived.
  void _armTimer(Exam exam) {
    if (!exam.hasTimeLimit || exam.paperToken == null) return;
    if (_timedToken == exam.paperToken) return;
    _timedToken = exam.paperToken;
    _timer?.cancel();
    _remaining = exam.timeLimitMinutes! * 60;
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() {
        final left = (_remaining ?? 0) - 1;
        _remaining = left;
        if (left <= 0) {
          t.cancel();
          // Hand in whatever is answered. Leaving the candidate on a finished clock with
          // a button the server has already decided to refuse would be worse.
          if (_result == null && !_submitting) _submit(exam, force: true);
        }
      });
    });
  }

  Future<void> _submit(Exam exam, {bool force = false}) async {
    if (!force && _answers.length < exam.questions.length && !_confirmedPartial) {
      setState(() => _confirmedPartial = true);
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final result = await ref.read(examRepositoryProvider).submit(
            widget.slug,
            answers: _answers,
            paperToken: exam.paperToken,
          );
      _timer?.cancel();
      if (mounted) setState(() => _result = result);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.code.message(L10n.of(context)));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final async = ref.watch(examProvider(widget.slug));

    return Scaffold(
      appBar: AppBar(title: Text(l.examTitle)),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _Message(asApiException(e).code.message(l)),
        data: (exam) {
          _armTimer(exam);
          if (_result != null) {
            return _Result(result: _result!, exam: exam, slug: widget.slug);
          }
          if (!exam.eligible) {
            return _Message(l.examNotEligible(exam.coursePercent));
          }
          if (exam.questions.isEmpty) return _Message(l.examEmpty);
          return _Paper(
            exam: exam,
            answers: _answers,
            remaining: _remaining,
            submitting: _submitting,
            error: _error,
            confirmPartial: _confirmedPartial,
            onChoose: (q, o) => setState(() => _answers[q] = o),
            onSubmit: () => _submit(exam),
          );
        },
      ),
    );
  }
}

class _Paper extends StatelessWidget {
  const _Paper({
    required this.exam,
    required this.answers,
    required this.onChoose,
    required this.onSubmit,
    this.remaining,
    this.submitting = false,
    this.error,
    this.confirmPartial = false,
  });

  final Exam exam;
  final Map<int, int> answers;
  final void Function(int questionId, int optionId) onChoose;
  final VoidCallback onSubmit;
  final int? remaining;
  final bool submitting;
  final String? error;
  final bool confirmPartial;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 30),
      children: [
        Text(l.examPassMark(exam.passPercent),
            style: const TextStyle(fontSize: 13.5, color: BrandColors.muted, height: 1.8)),
        if (remaining != null) ...[
          const SizedBox(height: 10),
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: remaining! <= 60
                    ? const Color(0xFFB3261E)
                    : BrandColors.accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Text(
                '${(remaining! ~/ 60).toString().padLeft(2, '0')}:${(remaining! % 60).toString().padLeft(2, '0')}',
                textDirection: TextDirection.ltr,
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 16,
                    color: remaining! <= 60 ? Colors.white : BrandColors.accent),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        for (final (index, question) in exam.questions.indexed) ...[
          Card(
            margin: const EdgeInsets.only(bottom: 12),
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${index + 1}. ${question.text}',
                      style: const TextStyle(
                          fontSize: 15, fontWeight: FontWeight.w700, height: 1.7)),
                  const SizedBox(height: 8),
                  for (final option in question.options)
                    RadioListTile<int>(
                      value: option.id,
                      // ignore: deprecated_member_use
                      groupValue: answers[question.id],
                      // ignore: deprecated_member_use
                      onChanged: (value) {
                        if (value != null) onChoose(question.id, value);
                      },
                      contentPadding: EdgeInsets.zero,
                      dense: true,
                      title: Text(option.text,
                          style: const TextStyle(fontSize: 14, height: 1.6)),
                    ),
                ],
              ),
            ),
          ),
        ],
        if (confirmPartial && answers.length < exam.questions.length)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(l.examPartialWarning(exam.questions.length - answers.length),
                style: const TextStyle(color: Color(0xFF9B6B00), fontSize: 13.5, height: 1.7)),
          ),
        if (error != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Text(error!,
                style: const TextStyle(color: Color(0xFFB3261E), fontSize: 13.5)),
          ),
        FilledButton(
          onPressed: submitting ? null : onSubmit,
          child: Text(submitting ? '…' : l.examSubmit),
        ),
      ],
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({required this.result, required this.exam, required this.slug});
  final ExamResult result;
  final Exam exam;
  final String slug;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final passed = result.attempt.passed;
    final byQuestion = {for (final r in result.review) r.questionId: r};

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        Icon(passed ? Icons.verified : Icons.refresh,
            size: 54, color: passed ? const Color(0xFF176B45) : BrandColors.accent),
        const SizedBox(height: 12),
        Center(
          child: Text('${result.attempt.scorePercent}%',
              style: TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.w900,
                  color: passed ? const Color(0xFF176B45) : BrandColors.accent)),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(
            l.examScoreLine(result.attempt.correctCount, result.attempt.questionCount),
            style: const TextStyle(fontSize: 14, color: BrandColors.muted),
          ),
        ),
        const SizedBox(height: 14),
        Text(passed ? l.examPassed : l.examFailed(result.passPercent),
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 15, height: 1.9)),
        if (result.certificateSerial != null) ...[
          const SizedBox(height: 18),
          FilledButton(
            onPressed: () => context.push('/certificates/${result.certificateSerial}'),
            child: Text(l.examViewCertificate),
          ),
        ],
        if (!passed) ...[
          const SizedBox(height: 18),
          // Attempts are unlimited by decision, so a failure is never a dead end.
          OutlinedButton(
            onPressed: () => context.pushReplacement('/courses/$slug/exam'),
            child: Text(l.examRetry),
          ),
        ],
        if (result.review.isNotEmpty) ...[
          const SizedBox(height: 26),
          Text(l.examReview,
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          for (final (index, question) in exam.questions.indexed)
            if (byQuestion[question.id] case final row?)
              Card(
                margin: const EdgeInsets.only(bottom: 10),
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(row.isCorrect ? Icons.check_circle : Icons.cancel,
                              size: 18,
                              color: row.isCorrect
                                  ? const Color(0xFF176B45)
                                  : const Color(0xFFB3261E)),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text('${index + 1}. ${question.text}',
                                style: const TextStyle(
                                    fontSize: 14.5, fontWeight: FontWeight.w700, height: 1.6)),
                          ),
                        ],
                      ),
                      if (row.correctOptionId != null) ...[
                        const SizedBox(height: 8),
                        Text(
                          l.examCorrectAnswer(question.options
                              .firstWhere((o) => o.id == row.correctOptionId,
                                  orElse: () => const ExamOption(id: 0, text: '—'))
                              .text),
                          style: const TextStyle(
                              fontSize: 13.5, color: Color(0xFF176B45), height: 1.7),
                        ),
                      ],
                      if (row.explanation?.trim().isNotEmpty ?? false) ...[
                        const SizedBox(height: 6),
                        Text(row.explanation!,
                            style: const TextStyle(
                                fontSize: 13, color: BrandColors.muted, height: 1.8)),
                      ],
                    ],
                  ),
                ),
              ),
        ],
      ],
    );
  }
}

class _Message extends StatelessWidget {
  const _Message(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(text,
              textAlign: TextAlign.center,
              style: const TextStyle(color: BrandColors.muted, height: 1.9, fontSize: 14.5)),
        ),
      );
}
