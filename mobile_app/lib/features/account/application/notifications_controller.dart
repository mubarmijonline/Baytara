// Polling, and only while it is worth doing.
//
// The poll is stopped when the app is backgrounded and resumed when it returns. A timer
// firing every 60 seconds behind a locked screen spends the user's battery and data to
// learn something they cannot see.
import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/api_error.dart';
import '../../../core/providers.dart';
import '../../auth/domain/session.dart';
import '../data/notifications_repository.dart';

final notificationsRepositoryProvider = Provider<NotificationsRepository>(
  (ref) => NotificationsRepository(client: ref.watch(apiClientProvider)),
);

/// Matches the website's header bell, which also polls every 60s.
const Duration kNotificationPollInterval = Duration(seconds: 60);

class NotificationsState {
  const NotificationsState({
    this.items = const [],
    this.unread = 0,
    this.loading = false,
    this.error,
  });

  final List<AppNotification> items;
  final int unread;
  final bool loading;
  final ApiErrorCode? error;

  NotificationsState copyWith({
    List<AppNotification>? items,
    int? unread,
    bool? loading,
    ApiErrorCode? error,
    bool clearError = false,
  }) =>
      NotificationsState(
        items: items ?? this.items,
        unread: unread ?? this.unread,
        loading: loading ?? this.loading,
        error: clearError ? null : (error ?? this.error),
      );
}

class NotificationsController extends Notifier<NotificationsState>
    with WidgetsBindingObserver {
  Timer? _timer;

  @override
  NotificationsState build() {
    WidgetsBinding.instance.addObserver(this);
    ref.onDispose(() {
      WidgetsBinding.instance.removeObserver(this);
      _timer?.cancel();
    });

    // Only a signed-in user has notifications, and the endpoint 401s for anyone else.
    ref.listen(sessionProvider, (_, session) {
      if (session is SessionSignedIn) {
        _start();
      } else {
        _stop();
        state = const NotificationsState();
      }
    });

    if (ref.read(sessionProvider) is SessionSignedIn) {
      Future.microtask(_start);
    }
    return const NotificationsState();
  }

  // The parameter must keep the name from WidgetsBindingObserver, which shadows the
  // Notifier's own `state` inside this method. Nothing here needs that, so it is harmless.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (ref.read(sessionProvider) is! SessionSignedIn) return;
    if (state == AppLifecycleState.resumed) {
      _start();
    } else {
      // Backgrounded: stop spending battery and data on something nobody can see.
      _stop();
    }
  }

  void _start() {
    _timer?.cancel();
    refresh();
    _timer = Timer.periodic(kNotificationPollInterval, (_) => refresh());
  }

  void _stop() {
    _timer?.cancel();
    _timer = null;
  }

  Future<void> refresh() async {
    state = state.copyWith(loading: state.items.isEmpty, clearError: true);
    try {
      final page = await ref.read(notificationsRepositoryProvider).list();
      state = NotificationsState(items: page.items, unread: page.unread);
    } on ApiException catch (e) {
      // A failed poll keeps whatever is already on screen; only a first load shows an error.
      state = state.copyWith(loading: false, error: e.code);
    }
  }

  /// Marks one read, optimistically.
  ///
  /// The badge and the row react at once and the server call reconciles after, which is what
  /// the website does too. A failed call reloads rather than leaving a lie on screen.
  Future<void> markRead(int id) async {
    final target = state.items.where((n) => n.id == id).firstOrNull;
    if (target == null || target.isRead) return;

    state = state.copyWith(
      items: [for (final n in state.items) n.id == id ? n.asRead() : n],
      unread: state.unread > 0 ? state.unread - 1 : 0,
    );
    try {
      await ref.read(notificationsRepositoryProvider).markRead(id);
    } on ApiException {
      await refresh();
    }
  }

  Future<void> markAllRead() async {
    state = state.copyWith(
      items: [for (final n in state.items) n.asRead()],
      unread: 0,
    );
    try {
      await ref.read(notificationsRepositoryProvider).markAllRead();
    } on ApiException {
      await refresh();
    }
  }
}

final notificationsProvider =
    NotifierProvider<NotificationsController, NotificationsState>(
        NotificationsController.new);
