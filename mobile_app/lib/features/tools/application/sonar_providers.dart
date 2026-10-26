import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/sonar_repository.dart';

final sonarRepositoryProvider = Provider<SonarRepository>(
  (ref) => SonarRepository(client: ref.watch(apiClientProvider)),
);

/// The signed-in account's saved cases, newest first.
final sonarHistoryProvider = FutureProvider.autoDispose<List<SonarExam>>(
  (ref) => ref.watch(sonarRepositoryProvider).history(),
);
