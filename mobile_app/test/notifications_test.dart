// Notifications.
//
// There is no push infrastructure server-side, so this is a poll. The behaviour worth
// pinning is what happens around that: optimistic reads so the badge reacts at once, and a
// failed poll that leaves what is already on screen alone.
import 'package:baytara/features/account/application/notifications_controller.dart'
    show kNotificationPollInterval;
import 'package:baytara/features/account/data/notifications_repository.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('parsing', () {
    test('reads a full row', () {
      final n = AppNotification.fromJson({
        'id': 4,
        'type': 'baytarian',
        'title': 'تم التوثيق',
        'body': 'حسابك موثّق الآن.',
        'is_read': false,
        'created_at': '2026-08-20T09:00:00+00:00',
      });
      expect(n.id, 4);
      expect(n.type, 'baytarian');
      expect(n.isRead, isFalse);
      expect(n.createdAt, isNotNull);
    });

    test('a body-less notification is valid', () {
      // push_notification(user_id, type, title, body=None) — body really is optional.
      final n = AppNotification.fromJson(
          {'id': 1, 'type': 'security', 'title': 't', 'is_read': true});
      expect(n.body, isNull);
      expect(n.isRead, isTrue);
    });

    test('a missing is_read reads as unread, which is the safe default', () {
      // Defaulting to read would silently hide something the user has not seen.
      expect(AppNotification.fromJson({'id': 1, 'type': 'x', 'title': 't'}).isRead,
          isFalse);
    });

    test('an unparseable date does not lose the notification', () {
      final n = AppNotification.fromJson(
          {'id': 1, 'type': 'x', 'title': 't', 'created_at': 'not a date'});
      expect(n.createdAt, isNull);
      expect(n.title, 't');
    });
  });

  group('marking read', () {
    test('asRead flips only the read flag', () {
      final n = AppNotification.fromJson({
        'id': 4, 'type': 'payment', 'title': 't', 'body': 'b', 'is_read': false,
        'created_at': '2026-08-20T09:00:00+00:00',
      });
      final read = n.asRead();

      expect(read.isRead, isTrue);
      expect(read.id, n.id);
      expect(read.title, n.title);
      expect(read.body, n.body);
      expect(read.createdAt, n.createdAt);
    });
  });

  group('the polling interval', () {
    test('matches the website, which also polls every 60 seconds', () {
      // frontend/web/src/layouts/Header.jsx uses setInterval(load, 60000).
      expect(kNotificationPollInterval.inSeconds, 60);
    });
  });
}
