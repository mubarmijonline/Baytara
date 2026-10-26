// حاسبة قياسات السونار التناسلي (milestone 29): the website's /tools/sonar, in the app.
//
// Signed in only: the route is not public, so the guard sends a visitor to sign in first.
// The server computes and saves; this screen collects measurements and shows the result,
// the per-measurement estimates, and the account's history.
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../../../core/i18n/app_localizations.dart';
import '../../../core/i18n/error_copy.dart';
import '../../../core/network/api_error.dart';
import '../../../core/theme/tokens.dart';
import '../application/sonar_providers.dart';
import '../data/sonar_repository.dart';

const _danger = Color(0xFFB3261E);

String speciesName(L10n l, String s) => switch (s) {
  'bovine' => l.sonarSpeciesBovine,
  'buffalo' => l.sonarSpeciesBuffalo,
  'equine' => l.sonarSpeciesEquine,
  'ovine' => l.sonarSpeciesOvine,
  _ => l.sonarSpeciesCaprine,
};

String measureName(L10n l, String species, String m, {bool short = false}) {
  if (m == 'vesicle' && species == 'equine') {
    return short ? 'EV' : l.sonarMeasureEquineVesicle;
  }
  return switch (m) {
    'vesicle' => short ? 'GSD' : l.sonarMeasureVesicle,
    'eye_orbit' => short ? l.sonarShortEye : l.sonarMeasureEye,
    'crl' => short ? 'CRL' : l.sonarMeasureCrl,
    'bpd' => short ? 'BPD' : l.sonarMeasureBpd,
    'hl' => short ? 'HL' : l.sonarMeasureHl,
    'trunk' => short ? l.sonarShortTrunk : l.sonarMeasureTrunk,
    _ => short ? l.sonarShortPlacentome : l.sonarMeasurePlacentome,
  };
}

String _date(BuildContext context, DateTime d) =>
    DateFormat.yMMMd(Localizations.localeOf(context).languageCode).format(d);

String _ageLine(L10n l, SonarExam e) => e.months == 0
    ? l.sonarUnderMonth
    : l.sonarMonthsDays(e.months, e.extraDays);

/// The same plain report the client's original file copied, one line per case.
String sonarReport(BuildContext context, L10n l, List<SonarExam> exams) {
  final lines = [
    for (final e in exams)
      l.sonarReportLine(
        e.label ?? l.sonarNoLabel,
        speciesName(l, e.species),
        e.ageDays,
        _ageLine(l, e),
        e.atTerm || e.expectedBirth == null
            ? l.sonarAtTerm
            : _date(context, e.expectedBirth!),
      ),
  ];
  return '${l.sonarReportTitle}:\n\n${lines.join('\n')}';
}

class SonarScreen extends ConsumerStatefulWidget {
  const SonarScreen({super.key});

  @override
  ConsumerState<SonarScreen> createState() => _SonarScreenState();
}

class _SonarScreenState extends ConsumerState<SonarScreen> {
  String _species = 'bovine';
  final _label = TextEditingController();
  final _fields = {for (final m in sonarMeasures) m: TextEditingController()};
  DateTime _examDate = DateTime.now();
  bool _busy = false;
  String? _error;
  SonarExam? _latest;

  @override
  void dispose() {
    _label.dispose();
    for (final c in _fields.values) {
      c.dispose();
    }
    super.dispose();
  }

  List<String> get _visibleMeasures => [
    for (final m in sonarMeasures)
      if (!(_species == 'equine' && m == 'placentome')) m,
  ];

  Future<void> _calculate() async {
    final l = L10n.of(context);
    final measures = <String, double>{};
    for (final m in _visibleMeasures) {
      final v = double.tryParse(_fields[m]!.text.trim().replaceAll(',', '.'));
      if (v != null && v > 0) measures[m] = v;
    }
    if (measures.isEmpty) {
      setState(() => _error = l.sonarErrNoMeasurements);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final exam = await ref
          .read(sonarRepositoryProvider)
          .calculate(
            species: _species,
            measures: measures,
            label: _label.text.trim().isEmpty ? null : _label.text.trim(),
            examDate: _examDate,
          );
      for (final c in _fields.values) {
        c.clear();
      }
      _label.clear();
      ref.invalidate(sonarHistoryProvider);
      if (mounted) setState(() => _latest = exam);
    } on ApiException catch (e) {
      if (!mounted) return;
      final code = e.data?['error'];
      setState(
        () => _error = switch (code) {
          'out_of_range' => l.sonarErrRange,
          'bad_date' => l.sonarErrDate,
          'no_measurements' => l.sonarErrNoMeasurements,
          _ => e.code.message(l),
        },
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _examDate,
      firstDate: now.subtract(const Duration(days: 365)),
      lastDate: now,
    );
    if (picked != null) setState(() => _examDate = picked);
  }

  Future<void> _clearAll() async {
    final l = L10n.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        content: Text(l.sonarClearConfirm),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(c, false),
            child: Text(l.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            child: Text(l.sonarClear, style: const TextStyle(color: _danger)),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(sonarRepositoryProvider).clear();
    ref.invalidate(sonarHistoryProvider);
    if (mounted) setState(() => _latest = null);
  }

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final history = ref.watch(sonarHistoryProvider);

    return Scaffold(
      appBar: AppBar(title: Text(l.sonarTitle)),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          if (_latest != null) ...[
            Text(
              l.sonarResult,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: BrandColors.ink,
              ),
            ),
            const SizedBox(height: 8),
            SonarResultCard(exam: _latest!, highlight: true),
            const SizedBox(height: 18),
          ],
          _card(
            Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final s in sonarSpecies)
                      ChoiceChip(
                        label: Text(speciesName(l, s)),
                        selected: _species == s,
                        selectedColor: BrandColors.accent,
                        labelStyle: TextStyle(
                          color: _species == s ? Colors.white : BrandColors.ink,
                          fontWeight: FontWeight.w700,
                        ),
                        onSelected: (_) => setState(() => _species = s),
                      ),
                  ],
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _label,
                  maxLength: 120,
                  decoration: InputDecoration(
                    labelText: l.sonarLabel,
                    hintText: l.sonarLabelHint,
                    counterText: '',
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _pickDate,
                  icon: const Icon(Icons.event_outlined),
                  label: Text(
                    '${l.sonarExamDate}: ${_date(context, _examDate)}',
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  l.sonarHint,
                  style: const TextStyle(
                    fontSize: 13,
                    color: BrandColors.muted,
                  ),
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: [
                    for (final m in _visibleMeasures)
                      SizedBox(
                        // Two to a row: the list's 16 + the card's 16 padding each side.
                        width:
                            (MediaQuery.sizeOf(context).width - 32 - 32 - 10) /
                            2,
                        child: TextField(
                          controller: _fields[m],
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          inputFormatters: [
                            FilteringTextInputFormatter.allow(
                              RegExp(r'[0-9.,]'),
                            ),
                          ],
                          textAlign: TextAlign.center,
                          decoration: InputDecoration(
                            labelText: '${measureName(l, _species, m)} (mm)',
                            labelStyle: const TextStyle(fontSize: 12.5),
                          ),
                        ),
                      ),
                  ],
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Text(
                      _error!,
                      style: const TextStyle(color: _danger),
                    ),
                  ),
                const SizedBox(height: 14),
                FilledButton(
                  onPressed: _busy ? null : _calculate,
                  style: FilledButton.styleFrom(
                    minimumSize: const Size.fromHeight(50),
                  ),
                  child: Text(
                    _busy ? l.sonarWorking : l.sonarCalculate,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  l.sonarDisclaimer,
                  style: const TextStyle(
                    fontSize: 12,
                    color: BrandColors.muted2,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(
                child: Text(
                  l.sonarHistory,
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: BrandColors.ink,
                  ),
                ),
              ),
              if ((history.value ?? const []).isNotEmpty) ...[
                IconButton(
                  tooltip: l.sonarShare,
                  icon: const Icon(Icons.share_outlined),
                  onPressed: () => SharePlus.instance.share(
                    ShareParams(
                      text: sonarReport(
                        context,
                        l,
                        history.value!.take(20).toList(),
                      ),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: l.sonarClear,
                  icon: const Icon(Icons.delete_sweep_outlined, color: _danger),
                  onPressed: _clearAll,
                ),
              ],
            ],
          ),
          const SizedBox(height: 8),
          history.when(
            loading: () => const Center(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: CircularProgressIndicator(),
              ),
            ),
            error: (e, _) =>
                Text(e is ApiException ? e.code.message(l) : l.errUnknown),
            data: (exams) => exams.isEmpty
                ? _card(
                    Center(
                      child: Text(
                        l.sonarNoHistory,
                        style: const TextStyle(color: BrandColors.muted),
                      ),
                    ),
                  )
                : Column(
                    children: [
                      for (final e in exams)
                        if (e.id != _latest?.id)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: SonarResultCard(
                              exam: e,
                              onDelete: () async {
                                await ref
                                    .read(sonarRepositoryProvider)
                                    .delete(e.id);
                                ref.invalidate(sonarHistoryProvider);
                              },
                            ),
                          ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }
}

Widget _card(Widget child) => Container(
  padding: const EdgeInsets.all(16),
  decoration: BoxDecoration(
    color: BrandColors.surface,
    borderRadius: BorderRadius.circular(16),
    border: Border.all(color: BrandColors.line),
  ),
  child: child,
);

class SonarResultCard extends StatelessWidget {
  const SonarResultCard({
    super.key,
    required this.exam,
    this.highlight = false,
    this.onDelete,
  });

  final SonarExam exam;
  final bool highlight;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final l = L10n.of(context);
    final e = exam;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: BrandColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: highlight ? BrandColors.accent : BrandColors.line,
          width: highlight ? 2 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 3,
                ),
                decoration: BoxDecoration(
                  color: BrandColors.accentSoft,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  speciesName(l, e.species),
                  style: const TextStyle(
                    color: BrandColors.accent,
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  e.label ?? l.sonarNoLabel,
                  style: const TextStyle(
                    fontWeight: FontWeight.w800,
                    color: BrandColors.ink,
                  ),
                ),
              ),
              Text(
                _date(context, e.examDate),
                style: const TextStyle(fontSize: 12, color: BrandColors.muted2),
              ),
              if (onDelete != null)
                IconButton(
                  tooltip: l.sonarDelete,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(
                    Icons.delete_outline,
                    size: 20,
                    color: BrandColors.muted2,
                  ),
                  onPressed: onDelete,
                ),
            ],
          ),
          const SizedBox(height: 10),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              gradient: BrandGradients.darkPanel,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l.sonarAge,
                  style: const TextStyle(
                    color: Color(0xFFC9D2F2),
                    fontSize: 12.5,
                  ),
                ),
                Text.rich(
                  TextSpan(
                    children: [
                      TextSpan(
                        text: l.sonarDays(e.ageDays),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 24,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      TextSpan(
                        text: '  (${_ageLine(l, e)})',
                        style: const TextStyle(
                          color: BrandColors.gold,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  '${l.sonarExpected}: ${e.atTerm || e.expectedBirth == null ? l.sonarAtTerm : _date(context, e.expectedBirth!)}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (!e.atTerm)
                  Text(
                    l.sonarRemaining(e.daysRemaining, e.gestationDays),
                    style: const TextStyle(
                      color: Color(0xFFC9D2F2),
                      fontSize: 12.5,
                    ),
                  ),
              ],
            ),
          ),
          if (e.perMeasure.length > 1 && e.rangeDays != null) ...[
            const SizedBox(height: 8),
            Text(
              l.sonarRange(e.rangeDays!.$1, e.rangeDays!.$2),
              style: const TextStyle(fontSize: 13, color: BrandColors.muted),
            ),
          ],
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (final m in e.perMeasure)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: m.beyondTerm
                        ? const Color(0xFFFDF0EF)
                        : BrandColors.surfaceMuted,
                    border: Border.all(
                      color: m.beyondTerm ? _danger : BrandColors.line,
                    ),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    '${measureName(l, e.species, m.measure, short: true)}: ${_mm(m.mm)}mm (${l.sonarDays(m.ageDays)})',
                    style: TextStyle(
                      fontSize: 12.5,
                      color: m.beyondTerm ? _danger : BrandColors.ink2,
                    ),
                  ),
                ),
            ],
          ),
          if (e.perMeasure.any((m) => m.beyondTerm))
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                l.sonarBeyond,
                style: const TextStyle(color: _danger, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }
}

String _mm(double v) =>
    v == v.roundToDouble() ? v.toInt().toString() : v.toString();
