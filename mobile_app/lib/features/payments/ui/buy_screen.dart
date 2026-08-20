// The purchase screen: quote, gateway, return, confirm.
import 'package:flutter/material.dart';
import 'package:flutter_custom_tabs/flutter_custom_tabs.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.dart';
import '../application/checkout_controller.dart';
import '../data/payment_dto.dart';
import '../data/payment_repository.dart';
import '../data/purchase_availability.dart';

final paymentRepositoryProvider = Provider<PaymentRepository>(
  (ref) => PaymentRepository(client: ref.watch(apiClientProvider)),
);

class BuyScreen extends ConsumerStatefulWidget {
  const BuyScreen({
    super.key,
    required this.kind,
    this.courseId,
    this.bundleId,
    this.videoId,
    this.title,
  });

  final PaymentKind kind;
  final int? courseId;
  final int? bundleId;
  final int? videoId;
  final String? title;

  @override
  ConsumerState<BuyScreen> createState() => _BuyScreenState();
}

class _BuyScreenState extends ConsumerState<BuyScreen> {
  late final CheckoutController _checkout =
      CheckoutController(repository: ref.read(paymentRepositoryProvider));

  CheckoutState _state = const CheckoutState();

  @override
  void initState() {
    super.initState();
    _checkout.stream.listen((s) {
      if (mounted) setState(() => _state = s);
    });
    _checkout.loadQuote(
      kind: widget.kind,
      courseId: widget.courseId,
      bundleId: widget.bundleId,
      videoId: widget.videoId,
    );
  }

  @override
  void dispose() {
    _checkout.dispose();
    super.dispose();
  }

  Future<void> _pay() async {
    final session = await _checkout.begin(
      kind: widget.kind,
      courseId: widget.courseId,
      bundleId: widget.bundleId,
      videoId: widget.videoId,
    );
    if (session == null || !mounted) return;

    // A Custom Tab, not a WebView. The gateway page handles card details, and putting that
    // inside an app-controlled WebView is both a security problem and a store-review one.
    await launchUrl(Uri.parse(session.url));

    // Returning here means the tab closed, which says nothing about the payment. Ask the
    // server. The deep link may also have fired; confirming twice is harmless because the
    // answer comes from the same place.
    if (!mounted) return;
    await _checkout.confirm(session.paymentId);
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l.checkoutTitle)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: switch (_state.stage) {
            CheckoutStage.quoting => const Center(child: CircularProgressIndicator()),
            CheckoutStage.confirming => _Waiting(text: l.checkoutConfirming),
            CheckoutStage.paid => _Result(
                icon: Icons.check_circle_outline,
                tone: const Color(0xFF1A7F4B),
                title: l.checkoutPaidTitle,
                body: l.checkoutPaidBody,
                actionLabel: l.myLearning,
                onAction: () => context.go('/dashboard'),
              ),
            CheckoutStage.stillPending => _Result(
                icon: Icons.schedule,
                tone: BrandColors.star,
                // Not a failure. A bank transfer can settle minutes later and the webhook
                // will record it, so the copy must not tell the user it went wrong.
                title: l.checkoutPendingTitle,
                body: l.checkoutPendingBody,
                actionLabel: l.paymentsTitle,
                onAction: () => context.go('/account/payments'),
              ),
            CheckoutStage.failed => _Result(
                icon: Icons.error_outline,
                tone: const Color(0xFFB3261E),
                title: l.checkoutFailedTitle,
                body: _state.error?.message(l) ?? l.errUnknown,
                actionLabel: l.commonRetry,
                onAction: _pay,
              ),
            _ => _Quote(quote: _state.quote, title: widget.title, onPay: _pay),
          },
        ),
      ),
    );
  }
}

class _Quote extends StatelessWidget {
  const _Quote({required this.quote, required this.onPay, this.title});

  final PaymentQuote? quote;
  final VoidCallback onPay;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final q = quote;
    if (q == null) return const Center(child: CircularProgressIndicator());

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(q.title.isNotEmpty ? q.title : (title ?? ''),
            style: const TextStyle(
                fontSize: 18, fontWeight: FontWeight.w800, height: 1.5)),
        const SizedBox(height: 20),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: BrandColors.surfaceMuted,
            border: Border.all(color: BrandColors.line),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${q.expectedAmount.toStringAsFixed(0)} EGP',
                  style: const TextStyle(
                      fontSize: 26, fontWeight: FontWeight.w800,
                      color: BrandColors.accent)),
              // The bare number does not explain itself on a renewal; the percentage does.
              if (q.kind == PaymentKind.renewal && q.renewalPercent != null) ...[
                const SizedBox(height: 6),
                Text(l.renewalExplainer(q.renewalPercent!.round()),
                    style: const TextStyle(
                        fontSize: 12.5, height: 1.7, color: BrandColors.muted)),
              ],
            ],
          ),
        ),
        const Spacer(),
        if (PurchaseAvailability.purchasesEnabled)
          SizedBox(
            width: double.infinity,
            child: FilledButton(onPressed: onPay, child: Text(l.checkoutPay)),
          )
        else
          // Reader model: the price is shown, buying is not offered, and no link out is
          // given either, because that is what Apple's rule actually forbids.
          Text(l.checkoutUnavailableOnThisPlatform,
              style: const TextStyle(
                  fontSize: 13.5, height: 1.8, color: BrandColors.muted)),
      ],
    );
  }
}

class _Waiting extends StatelessWidget {
  const _Waiting({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(),
            const SizedBox(height: 20),
            Text(text,
                textAlign: TextAlign.center,
                style: const TextStyle(color: BrandColors.muted, height: 1.8)),
          ],
        ),
      );
}

class _Result extends StatelessWidget {
  const _Result({
    required this.icon,
    required this.tone,
    required this.title,
    required this.body,
    required this.actionLabel,
    required this.onAction,
  });

  final IconData icon;
  final Color tone;
  final String title;
  final String body;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 46, color: tone),
            const SizedBox(height: 18),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
            const SizedBox(height: 10),
            Text(body,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 14, height: 1.9, color: BrandColors.muted)),
            const SizedBox(height: 26),
            FilledButton(onPressed: onAction, child: Text(actionLabel)),
          ],
        ),
      );
}
