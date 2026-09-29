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
import 'payment_method_screen.dart';

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

  /// Set when the user finished one of the non-charging methods, so the screen can say
  /// plainly what did and did not happen.
  PaymentMethodChoice? _testOutcome;

  /// The discount code, once the server has accepted it. Held rather than re-typed so the
  /// same code goes to checkout that was used for the quote the buyer agreed to.
  String? _appliedCode;
  final TextEditingController _codeField = TextEditingController();
  bool _checkingCode = false;
  String? _codeError;

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

  Future<void> _applyCode() async {
    final entered = _codeField.text.trim();
    if (entered.isEmpty) return;
    setState(() {
      _checkingCode = true;
      _codeError = null;
    });
    final quote = await _checkout.loadQuote(
      kind: widget.kind,
      courseId: widget.courseId,
      bundleId: widget.bundleId,
      videoId: widget.videoId,
      code: entered,
    );
    if (!mounted) return;
    setState(() {
      _checkingCode = false;
      if (quote == null) return;
      if (quote.promoError != null) {
        _appliedCode = null;
        _codeError = promoErrorMessage(quote.promoError!, L10n.of(context));
      } else {
        _appliedCode = entered;
      }
    });
  }

  Future<void> _clearCode() async {
    _codeField.clear();
    setState(() {
      _appliedCode = null;
      _codeError = null;
    });
    await _checkout.loadQuote(
      kind: widget.kind,
      courseId: widget.courseId,
      bundleId: widget.bundleId,
      videoId: widget.videoId,
    );
  }

  @override
  void dispose() {
    _codeField.dispose();
    _checkout.dispose();
    super.dispose();
  }

  /// Ask how they want to pay, then act on the answer.
  ///
  /// Only the hosted gateway actually moves money. The card form is presentation, and the
  /// test option deliberately grants nothing -- an in-app path that unlocked paid content
  /// without a payment would be a way to get the content for free, not a testing
  /// convenience.
  Future<void> _pay() async {
    final choice = await Navigator.of(context).push<PaymentMethodChoice>(
      MaterialPageRoute(
        builder: (_) => PaymentMethodScreen(quote: _state.quote),
      ),
    );
    if (choice == null || !mounted) return;

    switch (choice.kind) {
      case PaymentMethodKind.freeTest:
      case PaymentMethodKind.card:
        // Both end here. The card form collects nothing that could be charged, so
        // pretending otherwise would be worse than saying so.
        setState(() => _testOutcome = choice);
        return;
      case PaymentMethodKind.hostedGateway:
        await _payViaGateway();
    }
  }

  Future<void> _payViaGateway() async {
    final session = await _checkout.begin(
      kind: widget.kind,
      courseId: widget.courseId,
      bundleId: widget.bundleId,
      videoId: widget.videoId,
      // The code, not the discounted figure. The server recomputes the charge.
      code: _appliedCode,
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
          child: _testOutcome != null
              ? _Result(
                  icon: Icons.science_outlined,
                  tone: BrandColors.star,
                  title: l.checkoutTestTitle,
                  body: _testOutcome!.cardLast4 != null
                      ? '${l.checkoutCardPending(_testOutcome!.cardLast4!)}\n\n${l.checkoutTestBody}'
                      : l.checkoutTestBody,
                  actionLabel: l.paymentsTitle,
                  onAction: () => context.go('/account/payments'),
                )
              : switch (_state.stage) {
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
            _ => _Quote(
                quote: _state.quote,
                title: widget.title,
                onPay: _pay,
                codeField: _codeField,
                appliedCode: _appliedCode,
                codeError: _codeError,
                checkingCode: _checkingCode,
                onApplyCode: _applyCode,
                onClearCode: _clearCode,
              ),
          },
        ),
      ),
    );
  }
}

class _Quote extends StatelessWidget {
  const _Quote({
    required this.quote,
    required this.onPay,
    required this.codeField,
    required this.onApplyCode,
    required this.onClearCode,
    this.title,
    this.appliedCode,
    this.codeError,
    this.checkingCode = false,
  });

  final TextEditingController codeField;
  final VoidCallback onApplyCode;
  final VoidCallback onClearCode;
  final String? appliedCode;
  final String? codeError;
  final bool checkingCode;

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
              Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${q.payable.toStringAsFixed(0)} EGP',
                      style: const TextStyle(
                          fontSize: 26, fontWeight: FontWeight.w800,
                          color: BrandColors.accent)),
                  if (q.discount > 0) ...[
                    const SizedBox(width: 10),
                    // The list price stays visible, struck through: a discount nobody can
                    // see the original of is just a price.
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('${q.expectedAmount.toStringAsFixed(0)} EGP',
                          style: const TextStyle(
                              fontSize: 15, color: BrandColors.muted2,
                              decoration: TextDecoration.lineThrough)),
                    ),
                  ],
                ],
              ),
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
        if (PurchaseAvailability.purchasesEnabled) ...[
          const SizedBox(height: 16),
          if (appliedCode != null)
            Row(
              children: [
                Expanded(
                  child: Text('$appliedCode · −${q.discount.toStringAsFixed(0)} EGP',
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w800,
                          color: Color(0xFF1A7F4B))),
                ),
                TextButton(onPressed: onClearCode, child: Text(l.promoRemove)),
              ],
            )
          else
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: codeField,
                    textCapitalization: TextCapitalization.characters,
                    decoration: InputDecoration(
                      labelText: l.promoPlaceholder,
                      border: const OutlineInputBorder(),
                      isDense: true,
                      errorText: codeError,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: checkingCode ? null : onApplyCode,
                  child: Text(checkingCode ? '…' : l.promoApply),
                ),
              ],
            ),
        ],
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
