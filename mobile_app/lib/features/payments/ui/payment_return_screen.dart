// Where a payment return lands, whether it arrived by deep link or by the user coming back
// from the gateway tab.
//
// It does one thing: ask the server what happened. The redirect's `status` parameter never
// reaches this screen's decision, because it is attacker controllable and can arrive before
// the webhook has landed.
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/theme/tokens.dart';
import '../application/checkout_controller.dart';
import 'buy_screen.dart' show paymentRepositoryProvider;

class PaymentReturnScreen extends ConsumerStatefulWidget {
  const PaymentReturnScreen({super.key, required this.paymentId});
  final int paymentId;

  @override
  ConsumerState<PaymentReturnScreen> createState() => _PaymentReturnScreenState();
}

class _PaymentReturnScreenState extends ConsumerState<PaymentReturnScreen> {
  late final CheckoutController _checkout =
      CheckoutController(repository: ref.read(paymentRepositoryProvider));

  CheckoutState _state = const CheckoutState(stage: CheckoutStage.confirming);

  @override
  void initState() {
    super.initState();
    _checkout.stream.listen((s) {
      if (mounted) setState(() => _state = s);
    });
    _checkout.confirm(widget.paymentId);
  }

  @override
  void dispose() {
    _checkout.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(l.checkoutTitle)),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Center(
            child: switch (_state.stage) {
              CheckoutStage.paid => _Outcome(
                  icon: Icons.check_circle_outline,
                  tone: const Color(0xFF1A7F4B),
                  title: l.checkoutPaidTitle,
                  body: l.checkoutPaidBody,
                  label: l.myLearning,
                  onTap: () => context.go('/dashboard'),
                ),
              CheckoutStage.stillPending => _Outcome(
                  icon: Icons.schedule,
                  tone: BrandColors.star,
                  title: l.checkoutPendingTitle,
                  body: l.checkoutPendingBody,
                  label: l.paymentsTitle,
                  onTap: () => context.go('/account/payments'),
                ),
              CheckoutStage.failed => _Outcome(
                  icon: Icons.error_outline,
                  tone: const Color(0xFFB3261E),
                  title: l.checkoutFailedTitle,
                  body: _state.error?.message(l) ?? l.errUnknown,
                  label: l.paymentsTitle,
                  onTap: () => context.go('/account/payments'),
                ),
              _ => Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const CircularProgressIndicator(),
                    const SizedBox(height: 20),
                    Text(l.checkoutConfirming,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: BrandColors.muted, height: 1.8)),
                  ],
                ),
            },
          ),
        ),
      ),
    );
  }
}

class _Outcome extends StatelessWidget {
  const _Outcome({
    required this.icon,
    required this.tone,
    required this.title,
    required this.body,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final Color tone;
  final String title;
  final String body;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Column(
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
          FilledButton(onPressed: onTap, child: Text(label)),
        ],
      );
}
