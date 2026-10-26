// The ultrasound calculator's client: what it sends, and how it reads what comes back.
// The formulas are tested on the server against the client's own file
// (backend/tests/test_sonar.py); here only the wire.
import 'package:baytara/core/network/dio_client.dart';
import 'package:baytara/core/storage/device_id.dart';
import 'package:baytara/core/storage/secure_store.dart';
import 'package:baytara/features/tools/data/sonar_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeSecureStorage extends FlutterSecureStorage {
  _FakeSecureStorage(this.values) : super();
  final Map<String, String> values;

  @override
  Future<String?> read({
    required String key,
    dynamic iOptions,
    dynamic aOptions,
    dynamic lOptions,
    dynamic wOptions,
    dynamic mOptions,
    dynamic webOptions,
  }) async => values[key];

  @override
  Future<void> write({
    required String key,
    required String? value,
    dynamic iOptions,
    dynamic aOptions,
    dynamic lOptions,
    dynamic wOptions,
    dynamic mOptions,
    dynamic webOptions,
  }) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }

  @override
  Future<void> delete({
    required String key,
    dynamic iOptions,
    dynamic aOptions,
    dynamic lOptions,
    dynamic wOptions,
    dynamic mOptions,
    dynamic webOptions,
  }) async {
    values.remove(key);
  }
}

class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions o, String? body) handler;
  final List<RequestOptions> seen = [];
  final List<String?> bodies = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<List<int>>? requestStream,
    Future<void>? cancelFuture,
  ) {
    seen.add(options);
    bodies.add(options.data is Map ? options.data.toString() : null);
    return handler(options, bodies.last);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(String body, int status) => ResponseBody.fromString(
  body,
  status,
  headers: {
    Headers.contentTypeHeader: [Headers.jsonContentType],
  },
);

const _exam = '''
{"exam": {"id": 11, "label": "cow 45", "species": "bovine", "exam_date": "2026-10-01",
  "measures": {"crl": 9.0, "bpd": 90.0},
  "result": {"species": "bovine", "age_days": 140, "months": 4, "extra_days": 20,
    "gestation_days": 283, "days_remaining": 143, "at_term": false,
    "exam_date": "2026-10-01", "expected_birth": "2027-02-21", "range_days": [30, 250],
    "per_measure": [
      {"measure": "crl", "mm": 9.0, "age_days": 30, "beyond_term": false},
      {"measure": "bpd", "mm": 90.0, "age_days": 250, "beyond_term": false}]}}}''';

const _atTermHistory = '''
{"exams": [{"id": 12, "label": null, "species": "ovine", "exam_date": "2026-10-01",
  "measures": {"bpd": 90.0},
  "result": {"species": "ovine", "age_days": 160, "months": 5, "extra_days": 10,
    "gestation_days": 150, "days_remaining": 0, "at_term": true,
    "exam_date": "2026-10-01", "expected_birth": null, "range_days": [160, 160],
    "per_measure": [{"measure": "bpd", "mm": 90.0, "age_days": 160, "beyond_term": true}]}}],
 "more": false}''';

void main() {
  late _StubAdapter adapter;
  late SonarRepository repo;

  void build(Future<ResponseBody> Function(RequestOptions, String?) handler) {
    final store = SecureStore(storage: _FakeSecureStorage({}));
    adapter = _StubAdapter(handler);
    final client = ApiClient(
      store: store,
      deviceId: DeviceIdProvider(store),
      currentLanguage: () => 'ar',
      onSignOut: (_) {},
      baseUrl: 'https://example.test/api/v1',
    );
    client.raw.httpClientAdapter = adapter;
    repo = SonarRepository(client: client);
  }

  test(
    'sends species, measurements, label and the exam date as a plain date',
    () async {
      build((o, body) async => _json(_exam, 201));
      final exam = await repo.calculate(
        species: 'bovine',
        measures: {'crl': 9, 'bpd': 90},
        label: 'cow 45',
        examDate: DateTime(2026, 10, 1, 17, 45),
      );
      final sent = adapter.seen.single;
      expect(sent.method, 'POST');
      expect(sent.path, endsWith('/tools/sonar'));
      expect(sent.data, {
        'species': 'bovine',
        'measures': {'crl': 9.0, 'bpd': 90.0},
        'label': 'cow 45',
        'exam_date': '2026-10-01',
      });

      expect(exam.ageDays, 140);
      expect((exam.months, exam.extraDays), (4, 20));
      expect(exam.expectedBirth, DateTime(2027, 2, 21));
      expect(exam.rangeDays, (30, 250));
      expect(exam.perMeasure.map((m) => m.ageDays), [30, 250]);
    },
  );

  test('no label is no label, not an empty string', () async {
    build((o, body) async => _json(_exam, 201));
    await repo.calculate(species: 'ovine', measures: {'crl': 4});
    expect((adapter.seen.single.data as Map).containsKey('label'), isFalse);
  });

  test('an at-term case has no date and does not break parsing', () async {
    build((o, body) async => _json(_atTermHistory, 200));
    final exams = await repo.history();
    expect(exams.single.atTerm, isTrue);
    expect(exams.single.expectedBirth, isNull);
    expect(exams.single.rangeDays, (160, 160));
  });
}
