import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/exam_dto.dart';
import '../data/exam_repository.dart';

final examRepositoryProvider = Provider<ExamRepository>(
  (ref) => ExamRepository(client: ref.watch(apiClientProvider)),
);

/// The paper is drawn fresh on every read, so this is deliberately not cached across
/// navigations: reopening the exam is a new sitting with a new token.
final examProvider = FutureProvider.family<Exam, String>(
  (ref, slug) => ref.watch(examRepositoryProvider).exam(slug),
);
