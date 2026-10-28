// ignore_for_file: prefer_initializing_formals
// The reproductive ultrasound calculator (milestone 29). The formulas are the server's
// (backend/app/services/sonar.py); the app sends measurements and shows what comes back,
// so app and website can never disagree about an age.
import 'package:dio/dio.dart';

import '../../../core/network/dio_client.dart';

const sonarSpecies = [
  'bovine',
  'buffalo',
  'equine',
  'ovine',
  'caprine',
  'canine_small',
  'canine_large',
  'feline',
];

/// Dogs and cats (V6.2): measured on ICC, CRL, BPD and BD only, and aged in weeks.
const sonarSmallAnimals = ['canine_small', 'canine_large', 'feline'];

bool sonarUsesMeasure(String species, String m) =>
    !(species == 'equine' && m == 'placentome') &&
    !(sonarSmallAnimals.contains(species) &&
        const ['eye_orbit', 'hl', 'placentome'].contains(m));
const sonarMeasures = [
  'vesicle',
  'eye_orbit',
  'crl',
  'bpd',
  'hl',
  'trunk',
  'placentome',
];

class SonarMeasureAge {
  const SonarMeasureAge({
    required this.measure,
    required this.mm,
    required this.ageDays,
    required this.beyondTerm,
  });

  factory SonarMeasureAge.fromJson(Map<String, dynamic> j) => SonarMeasureAge(
    measure: j['measure'] as String,
    mm: (j['mm'] as num).toDouble(),
    ageDays: (j['age_days'] as num).toInt(),
    beyondTerm: j['beyond_term'] as bool? ?? false,
  );

  final String measure;
  final double mm;
  final int ageDays;

  /// The estimate from this one measurement is past a full gestation: almost certainly a
  /// typing error, and shown as one.
  final bool beyondTerm;
}

class SonarExam {
  const SonarExam({
    required this.id,
    required this.label,
    required this.species,
    required this.examDate,
    required this.ageDays,
    required this.months,
    required this.extraDays,
    this.inWeeks = false,
    this.weeks = 0,
    this.weekDays = 0,
    required this.gestationDays,
    required this.daysRemaining,
    required this.atTerm,
    required this.expectedBirth,
    required this.rangeDays,
    required this.perMeasure,
  });

  factory SonarExam.fromJson(Map<String, dynamic> j) {
    final r = j['result'] as Map<String, dynamic>;
    final range = (r['range_days'] as List?) ?? const [];
    return SonarExam(
      id: (j['id'] as num).toInt(),
      label: j['label'] as String?,
      species: j['species'] as String,
      examDate: DateTime.parse(j['exam_date'] as String),
      ageDays: (r['age_days'] as num).toInt(),
      months: (r['months'] as num).toInt(),
      extraDays: (r['extra_days'] as num).toInt(),
      inWeeks: r['age_unit'] == 'weeks',
      weeks: (r['weeks'] as num?)?.toInt() ?? 0,
      weekDays: (r['week_days'] as num?)?.toInt() ?? 0,
      gestationDays: (r['gestation_days'] as num).toInt(),
      daysRemaining: (r['days_remaining'] as num).toInt(),
      atTerm: r['at_term'] as bool? ?? false,
      expectedBirth: r['expected_birth'] == null
          ? null
          : DateTime.parse(r['expected_birth'] as String),
      rangeDays: range.length == 2
          ? ((range[0] as num).toInt(), (range[1] as num).toInt())
          : null,
      perMeasure: [
        for (final m in (r['per_measure'] as List? ?? const []))
          SonarMeasureAge.fromJson(m as Map<String, dynamic>),
      ],
    );
  }

  final int id;
  final String? label;
  final String species;
  final DateTime examDate;
  final int ageDays;
  final int months;
  final int extraDays;

  /// Dogs and cats are shown in weeks, as the client's file does.
  final bool inWeeks;
  final int weeks;
  final int weekDays;
  final int gestationDays;
  final int daysRemaining;
  final bool atTerm;
  final DateTime? expectedBirth;
  final (int, int)? rangeDays;
  final List<SonarMeasureAge> perMeasure;
}

class SonarRepository {
  SonarRepository({required ApiClient client}) : _client = client;

  final ApiClient _client;
  Dio get _dio => _client.raw;

  /// Computes and saves one case. A refusal (`no_measurements`, `out_of_range` with the
  /// `field`, `bad_date`) arrives as an ApiException carrying the server's body.
  Future<SonarExam> calculate({
    required String species,
    required Map<String, double> measures,
    String? label,
    DateTime? examDate,
  }) async {
    try {
      final res = await _dio.post<Map<String, dynamic>>(
        '/tools/sonar',
        data: {
          'species': species,
          'measures': measures,
          'label': ?label,
          if (examDate != null) 'exam_date': _isoDate(examDate),
        },
      );
      return SonarExam.fromJson(res.data!['exam'] as Map<String, dynamic>);
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<List<SonarExam>> history() async {
    try {
      final res = await _dio.get<Map<String, dynamic>>('/tools/sonar');
      return [
        for (final e in (res.data?['exams'] as List? ?? const []))
          SonarExam.fromJson(e as Map<String, dynamic>),
      ];
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<void> delete(int id) async {
    try {
      await _dio.delete<dynamic>('/tools/sonar/$id');
    } catch (e) {
      throw asApiException(e);
    }
  }

  Future<void> clear() async {
    try {
      await _dio.delete<dynamic>('/tools/sonar');
    } catch (e) {
      throw asApiException(e);
    }
  }
}

String _isoDate(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
