import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' hide TextDirection;

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/theme/tokens.dart';
import '../application/notifications_controller.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final state = ref.watch(notificationsProvider);
    final controller = ref.read(notificationsProvider.notifier);
    final locale = Localizations.localeOf(context).languageCode;
    final formatter = DateFormat.MMMd(locale == 'en' ? 'en_US' : 'ar_EG').add_jm();

    return Scaffold(
      appBar: AppBar(
        title: Text(l.notificationsTitle),
        actions: [
          if (state.unread > 0)
            TextButton(
              onPressed: controller.markAllRead,
              child: Text(l.notificationsMarkAll,
                  style: const TextStyle(color: Colors.white)),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: controller.refresh,
        child: state.loading && state.items.isEmpty
            ? const Center(child: CircularProgressIndicator())
            : state.items.isEmpty
                ? ListView(children: [
                    Padding(
                      padding: const EdgeInsets.all(40),
                      child: Center(
                        child: Text(
                          state.error != null
                              ? state.error!.message(l)
                              : l.notificationsEmpty,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: BrandColors.muted2),
                        ),
                      ),
                    ),
                  ])
                : ListView.separated(
                    itemCount: state.items.length,
                    separatorBuilder: (_, _) => const Divider(height: 1),
                    itemBuilder: (context, i) {
                      final n = state.items[i];
                      return ListTile(
                        // Reading one is a tap on the row, as on the website.
                        onTap: n.isRead ? null : () => controller.markRead(n.id),
                        tileColor:
                            n.isRead ? null : BrandColors.accentSoft.withValues(alpha: 0.5),
                        leading: Icon(_iconFor(n.type),
                            color: n.isRead ? BrandColors.muted2 : BrandColors.accent),
                        title: Text(n.title,
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight:
                                    n.isRead ? FontWeight.w500 : FontWeight.w700)),
                        subtitle: n.body == null && n.createdAt == null
                            ? null
                            : Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    if (n.body != null)
                                      Text(n.body!,
                                          style: const TextStyle(
                                              fontSize: 12.5, height: 1.6,
                                              color: BrandColors.muted)),
                                    if (n.createdAt != null)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text(
                                          formatter.format(n.createdAt!.toLocal()),
                                          style: const TextStyle(
                                              fontSize: 11.5,
                                              color: BrandColors.muted2),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                      );
                    },
                  ),
      ),
    );
  }

  static IconData _iconFor(String type) => switch (type) {
        'security' => Icons.shield_outlined,
        'payment' => Icons.payments_outlined,
        'baytarian' => Icons.verified_outlined,
        _ => Icons.notifications_none,
      };
}

/// The unread badge, for the app bar of other screens.
class NotificationBell extends ConsumerWidget {
  const NotificationBell({super.key, required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unread = ref.watch(notificationsProvider).unread;
    final l = L10n.of(context);

    return Semantics(
      label: unread > 0 ? l.notificationsUnread(unread) : l.notificationsTitle,
      button: true,
      child: Stack(
        alignment: Alignment.center,
        children: [
          IconButton(icon: const Icon(Icons.notifications_none), onPressed: onTap),
          if (unread > 0)
            PositionedDirectional(
              top: 8,
              end: 8,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                decoration: BoxDecoration(
                  color: const Color(0xFFB3261E),
                  borderRadius: BorderRadius.circular(9),
                ),
                constraints: const BoxConstraints(minWidth: 16),
                child: Text(
                  unread > 99 ? '99+' : '$unread',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
