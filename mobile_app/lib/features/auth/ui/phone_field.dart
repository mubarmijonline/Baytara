// Country picker plus national number, mirroring frontend/web/src/components/PhoneField.jsx.
//
// The national box refuses a leading zero on purpose: the trunk 0 belongs to dialling
// inside a country and the picker has already said which country this is. Typing it would
// build +20 0102..., one digit too long but still reading as correct to a person.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/tokens.dart';
import '../../../core/validation/phone.dart';

class PhoneField extends StatefulWidget {
  const PhoneField({
    super.key,
    required this.dial,
    required this.national,
    required this.onChanged,
    this.label,
    this.autofocus = false,
  });

  final String dial;
  final String national;
  final void Function(String dial, String national) onChanged;
  final String? label;
  final bool autofocus;

  @override
  State<PhoneField> createState() => _PhoneFieldState();
}

class _PhoneFieldState extends State<PhoneField> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.national);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final country = countryFor(widget.dial);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        DropdownButtonHidden(
          dial: widget.dial,
          onChanged: (d) => widget.onChanged(d, _controller.text),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: TextField(
            controller: _controller,
            autofocus: widget.autofocus,
            keyboardType: TextInputType.phone,
            // A phone number reads left-to-right even on an Arabic screen.
            textDirection: TextDirection.ltr,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(nationalLength(widget.dial) + 1),
            ],
            onChanged: (raw) {
              final cleaned = nationalDigits(raw);
              if (cleaned != raw) {
                _controller.value = TextEditingValue(
                  text: cleaned,
                  selection: TextSelection.collapsed(offset: cleaned.length),
                );
              }
              widget.onChanged(widget.dial, cleaned);
            },
            decoration: InputDecoration(
              labelText: widget.label,
              hintText: country.example,
              hintTextDirection: TextDirection.ltr,
            ),
          ),
        ),
      ],
    );
  }
}

/// The country selector. Split out only to keep the field above readable.
class DropdownButtonHidden extends StatelessWidget {
  const DropdownButtonHidden({super.key, required this.dial, required this.onChanged});

  final String dial;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 56,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: BrandColors.surfaceMuted,
        border: Border.all(color: BrandColors.line),
        borderRadius: BorderRadius.circular(12),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: dial,
          onChanged: (v) => v == null ? null : onChanged(v),
          items: [
            for (final c in countries)
              DropdownMenuItem(
                value: c.dial,
                child: Text('${c.flag}  +${c.dial}',
                    style: const TextStyle(fontSize: 14, height: 1.2)),
              ),
          ],
        ),
      ),
    );
  }
}
