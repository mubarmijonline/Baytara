// ignore_for_file: prefer_initializing_formals
// Notifications.
//
// **There is no push infrastructure.** No FCM, no APNs, nothing server-side that could send
// one. Adding it is a backend change and has to be agreed separately, so the app polls while
// it is foregrounded, exactly as the website's header bell does
// (frontend/web/src/layouts/Header.jsx, also 60s).
//
// The consequence worth stating: a verification result or a payment confirmation reaches the
// user only when the app is open. That is a product limitation, not a client bug.
import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.isRead,
    this.body,
    this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: (j['id'] as num).toInt(),
        // e.g. `security`, `baytarian`, `payment`. Decides the icon only.
        type: j['type'] as String? ?? '',
        title: j['title'] as String? ?? '',
        body: j['body'] as String?,
        isRead: j['is_read'] as bool? ?? false,
        createdAt: DateTime.tryParse(j['created_at'] as String? ?? ''),
      );

  final int id;
  final String type;
  final String title;
  final String? body;
  final bool isRead;
  final DateTime? createdAt;

  AppNotification asRead() => AppNotification(
        id: id, type: type, title: title, body: body, isRead: true, createdAt: createdAt,
      );
}

class NotificationsPage {
  const NotificationsPage({required this.items, required this.unread});
  final List<AppNotification> items;
  final int unread;
}

class NotificationsRepository {
  NotificationsRepository({required ApiClient client}) : _client = client;
  final ApiClient _client;
  Dio get _dio => _client.raw;

  /// The 50 most recent, newest first, plus the unread count.
  Future<NotificationsPage> list() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/notifications');
      final body = res.data ?? const {};
      return NotificationsPage(
        items: [
          for (final n in (body['notifications'] as List? ?? const []))
            AppNotification.fromJson((n as Map).cast<String, dynamic>()),
        ],
        unread: (body['unread'] as num?)?.toInt() ?? 0,
      );
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<int> unreadCount() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/notifications/unread-count');
      return (res.data?['unread'] as num?)?.toInt() ?? 0;
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<void> markRead(int id) async {
    try {
      await _dio.post<dynamic>('/notifications/$id/read');
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<void> markAllRead() async {
    try {
      await _dio.post<dynamic>('/notifications/read-all');
    } catch (e) {
      throw asApiException(e);
    }
  }
}
