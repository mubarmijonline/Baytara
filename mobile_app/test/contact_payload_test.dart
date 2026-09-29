// The contact payload.
//
// ContactSchema in backend/app/api/v1/content.py requires `name`, `email` and **`body`**,
// with `subject` optional. The app sent `message`, so every contact form submission was
// rejected with a validation error. Verifying the endpoint existed was not the same as
// verifying its field names, which is the mistake this test exists to stop repeating.
import 'package:baytara/core/network/dio_client.dart';
import 'package:baytara/core/storage/device_id.dart';
import 'package:baytara/core/storage/secure_store.dart';
import 'package:baytara/features/catalogue/data/catalogue_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeStorage extends FlutterSecureStorage {
  _FakeStorage(this.values) : super();
  final Map<String, String> values;

  @override
  Future<String?> read({required String key, dynamic iOptions, dynamic aOptions,
      dynamic lOptions, dynamic wOptions, dynamic mOptions, dynamic webOptions}) async =>
      values[key];

  @override
  Future<void> write({required String key, required String? value, dynamic iOptions,
      dynamic aOptions, dynamic lOptions, dynamic wOptions, dynamic mOptions,
      dynamic webOptions}) async {
    if (value == null) {
      values.remove(key);
    } else {
      values[key] = value;
    }
  }

  @override
  Future<void> delete({required String key, dynamic iOptions, dynamic aOptions,
      dynamic lOptions, dynamic wOptions, dynamic mOptions, dynamic webOptions}) async {
    values.remove(key);
  }
}

class _Capture implements HttpClientAdapter {
  Map<String, dynamic>? sent;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? requestStream,
      Future<void>? cancelFuture) async {
    sent = (options.data as Map).cast<String, dynamic>();
    return ResponseBody.fromString('{"status":"received","id":1}', 201,
        headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  late _Capture capture;
  late CatalogueRepository repo;

  setUp(() {
    final store = SecureStore(storage: _FakeStorage({}));
    capture = _Capture();
    final client = ApiClient(
      store: store,
      deviceId: DeviceIdProvider(store),
      currentLanguage: () => 'ar',
      onSignOut: (_) {},
      baseUrl: 'https://example.test/api/v1',
    );
    client.raw.httpClientAdapter = capture;
    repo = CatalogueRepository(client: client);
  });

  test('sends body, which is the field the server requires', () async {
    await repo.contact(name: 'Omar', email: 'o@example.com', body: 'مرحبا');

    expect(capture.sent!['body'], 'مرحبا');
    expect(capture.sent!.containsKey('message'), isFalse,
        reason: 'ContactSchema has no `message` field; sending one fails validation');
    expect(capture.sent!['name'], 'Omar');
    expect(capture.sent!['email'], 'o@example.com');
  });

  test('a subject is included when given', () async {
    await repo.contact(
      name: 'Omar',
      email: 'o@example.com',
      body: 'x',
      subject: 'Demo request',
    );
    expect(capture.sent!['subject'], 'Demo request');
  });

  test('a blank subject is omitted rather than sent empty', () async {
    await repo.contact(name: 'Omar', email: 'o@example.com', body: 'x', subject: '   ');
    expect(capture.sent!.containsKey('subject'), isFalse);
  });
}
