// Payment history. Status is whatever the server says; nothing here infers one.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' hide TextDirection;

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/dio_client.dart';
import '../../../core/theme/tokens.dart';
import '../data/payment_dto.dart';
import 'buy_screen.dart' show paymentRepositoryProvider;

final paymentHistoryProvider = FutureProvider<List<Payment>>(
  (ref) => ref.watch(paymentRepositoryProvider).history(),
);

class PaymentsScreen extends ConsumerWidget {
  const PaymentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = L10n.of(context);
    final async = ref.watch(paymentHistoryProvider);
    final locale = Localizations.localeOf(context).languageCode;
    final formatter = DateFormat.yMMMd(locale == 'en' ? 'en_US' : 'ar_EG');

    return Scaffold(
      appBar: AppBar(title: Text(l.paymentsTitle)),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(paymentHistoryProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(children: [
            Padding(
              padding: const EdgeInsets.all(32),
              child: Text(asApiException(e).code.message(l),
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: BrandColors.muted, height: 1.7)),
            ),
          ]),
          data: (rows) => rows.isEmpty
              ? ListView(children: [
                  Padding(
                    padding: const EdgeInsets.all(40),
                    child: Center(
                      child: Text(l.paymentsEmpty,
                          style: const TextStyle(color: BrandColors.muted2)),
                    ),
                  ),
                ])
              : ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  itemCount: rows.length,
                  itemBuilder: (context, i) {
                    final p = rows[i];
                    return Card(
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        title: Text('${p.amount.toStringAsFixed(0)} ${p.currency}',
                            style: const TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w700)),
                        subtitle: Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            p.createdAt == null
                                ? _kindLabel(p.kind, l)
                                : '${_kindLabel(p.kind, l)} · ${formatter.format(p.createdAt!.toLocal())}',
                            style: const TextStyle(
                                fontSize: 12.5, color: BrandColors.muted2),
                          ),
                        ),
                        trailing: _StatusChip(payment: p),
                      ),
                    );
                  },
                ),
        ),
      ),
    );
  }

  static String _kindLabel(PaymentKind kind, L10n l) => switch (kind) {
        PaymentKind.enroll => l.enroll,
        PaymentKind.renewal => l.renewAccess,
        PaymentKind.bundle => l.navBundles,
        PaymentKind.video => l.navVideos,
      };
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.payment});
  final Payment payment;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    // A refund is reported ahead of the status: a refunded row still reads `paid`
    // server-side, and showing "paid" alone would be misleading.
    final (label, tone) = payment.isRefunded
        ? (l.paymentRefunded, BrandColors.muted)
        : payment.isPaid
            ? (l.paymentPaid, const Color(0xFF1A7F4B))
            : payment.isPending
                ? (l.paymentPending, BrandColors.star)
                : (l.paymentFailed, const Color(0xFFB3261E));

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: tone.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label,
          style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w700, color: tone)),
    );
  }
}
