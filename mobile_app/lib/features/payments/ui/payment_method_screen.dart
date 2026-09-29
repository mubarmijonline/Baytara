// Choosing how to pay, and the card form.
//
// READ THIS BEFORE TRUSTING ANYTHING ON THIS SCREEN.
//
// The card form is **presentation only**. It validates shape (Luhn, expiry, CVC length) so
// the flow feels real, and then it does nothing with the numbers: they are never sent
// anywhere, never stored, and never leave the widget's State. Real card payments go through
// the Fawaterak hosted page, which is the whole reason this app never handles a PAN.
//
// Nothing here is PCI-compliant and nothing here should ever be wired to a real processor.
// If card entry inside the app is ever wanted for real, it needs a payment SDK that
// tokenises on-device (Stripe Elements, Checkout.com Frames, and so on) and this file gets
// deleted rather than extended.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/theme/tokens.dart';
import '../data/payment_dto.dart';

/// How the user says they want to pay.
enum PaymentMethodKind {
  /// The real one: Fawaterak's hosted page, opened in a Custom Tab.
  hostedGateway,

  /// Card details typed in the app. UI only; see the file comment.
  card,

  /// Grants nothing and charges nothing. Present so the surrounding flow can be exercised
  /// without money moving.
  freeTest,
}

class PaymentMethodChoice {
  const PaymentMethodChoice(this.kind, {this.cardLast4});
  final PaymentMethodKind kind;
  final String? cardLast4;
}

class PaymentMethodScreen extends ConsumerStatefulWidget {
  const PaymentMethodScreen({super.key, required this.quote});
  final PaymentQuote? quote;

  @override
  ConsumerState<PaymentMethodScreen> createState() => _PaymentMethodScreenState();
}

class _PaymentMethodScreenState extends ConsumerState<PaymentMethodScreen> {
  PaymentMethodKind _selected = PaymentMethodKind.hostedGateway;

  final _number = TextEditingController();
  final _expiry = TextEditingController();
  final _cvc = TextEditingController();
  final _holder = TextEditingController();
  String? _cardError;

  @override
  void dispose() {
    _number.dispose();
    _expiry.dispose();
    _cvc.dispose();
    _holder.dispose();
    super.dispose();
  }

  /// Luhn check. Catches a mistyped digit before the user waits on a network round trip;
  /// it says nothing about whether the card exists or has funds.
  static bool _luhnValid(String digits) {
    if (digits.length < 12) return false;
    var sum = 0;
    var alternate = false;
    for (var i = digits.length - 1; i >= 0; i--) {
      var n = int.parse(digits[i]);
      if (alternate) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alternate = !alternate;
    }
    return sum % 10 == 0;
  }

  bool _expiryValid(String text) {
    final parts = text.split('/');
    if (parts.length != 2) return false;
    final month = int.tryParse(parts[0]);
    final year = int.tryParse(parts[1]);
    if (month == null || year == null || month < 1 || month > 12) return false;
    final now = DateTime.now();
    final fullYear = 2000 + year;
    // The card is good through the last day of its expiry month.
    return DateTime(fullYear, month + 1, 0).isAfter(now);
  }

  String? _validateCard(L10n l) {
    final digits = _number.text.replaceAll(RegExp(r'\D'), '');
    if (!_luhnValid(digits)) return l.cardNumberInvalid;
    if (!_expiryValid(_expiry.text.trim())) return l.cardExpiryInvalid;
    if (_cvc.text.trim().length < 3) return l.cardCvcInvalid;
    if (_holder.text.trim().isEmpty) return l.cardHolderRequired;
    return null;
  }

  void _confirm() {
    final l = L10n.of(context);
    if (_selected == PaymentMethodKind.card) {
      final problem = _validateCard(l);
      if (problem != null) {
        setState(() => _cardError = problem);
        return;
      }
      final digits = _number.text.replaceAll(RegExp(r'\D'), '');
      Navigator.of(context).pop(
        PaymentMethodChoice(
          PaymentMethodKind.card,
          // Only the last four leave this screen. The rest is discarded with the State.
          cardLast4: digits.substring(digits.length - 4),
        ),
      );
      return;
    }
    Navigator.of(context).pop(PaymentMethodChoice(_selected));
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final quote = widget.quote;

    return Scaffold(
      appBar: AppBar(title: Text(l.paymentMethodTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 18, 20, 40),
        children: [
          if (quote != null) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: BrandColors.surfaceMuted,
                border: Border.all(color: BrandColors.line),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(children: [
                Expanded(
                  child: Text(quote.title,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w700, height: 1.5)),
                ),
                const SizedBox(width: 12),
                Text('${quote.expectedAmount.toStringAsFixed(0)} EGP',
                    style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: BrandColors.accent)),
              ]),
            ),
            const SizedBox(height: 22),
          ],

          _MethodTile(
            kind: PaymentMethodKind.hostedGateway,
            selected: _selected,
            icon: Icons.account_balance_outlined,
            title: l.methodGatewayTitle,
            subtitle: l.methodGatewaySubtitle,
            onTap: (k) => setState(() => _selected = k),
          ),
          _MethodTile(
            kind: PaymentMethodKind.card,
            selected: _selected,
            icon: Icons.credit_card,
            title: l.methodCardTitle,
            subtitle: l.methodCardSubtitle,
            onTap: (k) => setState(() => _selected = k),
          ),
          _MethodTile(
            kind: PaymentMethodKind.freeTest,
            selected: _selected,
            icon: Icons.science_outlined,
            title: l.methodTestTitle,
            subtitle: l.methodTestSubtitle,
            onTap: (k) => setState(() => _selected = k),
          ),

          if (_selected == PaymentMethodKind.card) ...[
            const SizedBox(height: 20),
            // Stated on the screen, not only in a code comment: the person typing a card
            // number deserves to know it goes nowhere.
            Container(
              padding: const EdgeInsets.all(13),
              decoration: BoxDecoration(
                color: BrandColors.star.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Row(children: [
                const Icon(Icons.info_outline, size: 17, color: BrandColors.star),
                const SizedBox(width: 9),
                Expanded(
                  child: Text(l.cardDemoNotice,
                      style: const TextStyle(
                          fontSize: 12, height: 1.7, color: BrandColors.ink2)),
                ),
              ]),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _number,
              keyboardType: TextInputType.number,
              textDirection: TextDirection.ltr,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(19),
                _CardNumberFormatter(),
              ],
              decoration: InputDecoration(
                labelText: l.cardNumber,
                hintText: '4242 4242 4242 4242',
                hintTextDirection: TextDirection.ltr,
                prefixIcon: const Icon(Icons.credit_card, size: 20),
              ),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _expiry,
                  keyboardType: TextInputType.number,
                  textDirection: TextDirection.ltr,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(4),
                    _ExpiryFormatter(),
                  ],
                  decoration: InputDecoration(
                    labelText: l.cardExpiry,
                    hintText: 'MM/YY',
                    hintTextDirection: TextDirection.ltr,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextField(
                  controller: _cvc,
                  keyboardType: TextInputType.number,
                  obscureText: true,
                  textDirection: TextDirection.ltr,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(4),
                  ],
                  decoration: InputDecoration(
                    labelText: l.cardCvc,
                    hintText: '123',
                    hintTextDirection: TextDirection.ltr,
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 12),
            TextField(
              controller: _holder,
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(labelText: l.cardHolder),
            ),
            if (_cardError != null) ...[
              const SizedBox(height: 12),
              Text(_cardError!,
                  style: const TextStyle(fontSize: 13, color: Color(0xFFB3261E))),
            ],
          ],

          const SizedBox(height: 26),
          FilledButton(
            onPressed: _confirm,
            child: Text(_selected == PaymentMethodKind.freeTest
                ? l.methodTestConfirm
                : l.checkoutPay),
          ),
        ],
      ),
    );
  }
}

class _MethodTile extends StatelessWidget {
  const _MethodTile({
    required this.kind,
    required this.selected,
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final PaymentMethodKind kind;
  final PaymentMethodKind selected;
  final IconData icon;
  final String title;
  final String subtitle;
  final ValueChanged<PaymentMethodKind> onTap;

  @override
  Widget build(BuildContext context) {
    final isSelected = kind == selected;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: isSelected ? BrandColors.accent : BrandColors.line,
          width: isSelected ? 1.6 : 1,
        ),
      ),
      child: ListTile(
        onTap: () => onTap(kind),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: Icon(icon,
            color: isSelected ? BrandColors.accent : BrandColors.muted2),
        title: Text(title,
            style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w700)),
        subtitle: Padding(
          padding: const EdgeInsets.only(top: 3),
          child: Text(subtitle,
              style: const TextStyle(
                  fontSize: 12.5, height: 1.6, color: BrandColors.muted2)),
        ),
        trailing: Icon(
          isSelected ? Icons.radio_button_checked : Icons.radio_button_unchecked,
          color: isSelected ? BrandColors.accent : BrandColors.muted2,
        ),
      ),
    );
  }
}

/// Groups the number in fours, which is how people read a card off the plastic.
class _CardNumberFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue old, TextEditingValue next) {
    final digits = next.text.replaceAll(RegExp(r'\D'), '');
    final buffer = StringBuffer();
    for (var i = 0; i < digits.length; i++) {
      if (i > 0 && i % 4 == 0) buffer.write(' ');
      buffer.write(digits[i]);
    }
    final text = buffer.toString();
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}

/// Inserts the slash so the field reads MM/YY without the user typing it.
class _ExpiryFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue old, TextEditingValue next) {
    final digits = next.text.replaceAll(RegExp(r'\D'), '');
    final text = digits.length <= 2
        ? digits
        : '${digits.substring(0, 2)}/${digits.substring(2)}';
    return TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: text.length),
    );
  }
}
