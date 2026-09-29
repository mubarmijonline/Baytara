import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/learning_dto.dart';
import '../data/learning_repository.dart';

final learningRepositoryProvider = Provider<LearningRepository>(
  (ref) => LearningRepository(client: ref.watch(apiClientProvider)),
);

final learningSummaryProvider = FutureProvider<LearningSummary>(
  (ref) => ref.watch(learningRepositoryProvider).summary(),
);

final enrollmentsProvider = FutureProvider<List<Enrollment>>(
  (ref) => ref.watch(learningRepositoryProvider).enrollments(),
);

final certificatesProvider = FutureProvider<List<Certificate>>(
  (ref) => ref.watch(learningRepositoryProvider).certificates(),
);

final watchHistoryProvider = FutureProvider<List<WatchedVideo>>(
  (ref) => ref.watch(learningRepositoryProvider).watchHistory(),
);

final courseProgressProvider = FutureProvider.family<CourseProgress, String>(
  (ref, slug) => ref.watch(learningRepositoryProvider).progress(slug),
);
