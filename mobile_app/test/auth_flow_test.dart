// The auth flows against a stubbed server, checking the things that are easy to get wrong
// and expensive to discover on a device:
//
//   - device_id travels in the JSON body on register/login/google (the header alone is not
//     enough -- the server cross-checks the two and puts the body value in the JWT);
//   - both tokens are stored before the call returns, so a caller that navigates on the
//     result cannot reach an authed screen with unwritten tokens;
//   - a 403 device_limit_reached becomes the typed exception carrying the device list, so
//     the screen does not have to make a second call to show what is in the way.
import 'package:baytara/core/network/api_error.dart';
import 'package:baytara/core/network/dio_client.dart';
import 'package:baytara/core/storage/device_id.dart';
import 'package:baytara/core/storage/secure_store.dart';
import 'package:baytara/features/auth/data/auth_repository.dart';
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakeSecureStorage extends FlutterSecureStorage {
  _FakeSecureStorage(this.values) : super();
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

class _StubAdapter implements HttpClientAdapter {
  _StubAdapter(this.handler);
  final Future<ResponseBody> Function(RequestOptions o, String? body) handler;
  final List<RequestOptions> seen = [];
  final List<String?> bodies = [];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<List<int>>? requestStream,
      Future<void>? cancelFuture) {
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
      headers: {Headers.contentTypeHeader: [Headers.jsonContentType]},
    );

const _userJson = '''
{"id":7,"name":"Omar","email":"o@example.com","phone":"+201024527770",
 "role":"student","is_baytarian":false,"is_vet_student":false}''';

void main() {
  late Map<String, String> stored;
  late SecureStore store;
  late DeviceIdProvider deviceId;
  late AuthRepository repo;
  late _StubAdapter adapter;

  void build(Future<ResponseBody> Function(RequestOptions, String?) handler) {
    stored = {};
    store = SecureStore(storage: _FakeSecureStorage(stored));
    deviceId = DeviceIdProvider(store);
    adapter = _StubAdapter(handler);
    final client = ApiClient(
      store: store,
      deviceId: deviceId,
      currentLanguage: () => 'ar',
      onSignOut: (_) {},
      baseUrl: 'https://example.test/api/v1',
    );
    client.raw.httpClientAdapter = adapter;
    repo = AuthRepository(client: client, store: store, deviceId: deviceId);
  }

  test('login sends device_id in the body and stores both tokens', () async {
    build((o, body) async =>
        _json('{"user":$_userJson,"access_token":"acc","refresh_token":"ref"}', 200));

    final result = await repo.login(email: 'o@example.com', password: 'secret123');

    expect(result.user.id, 7);
    expect(stored['baytara_access_token'], 'acc');
    expect(stored['baytara_refresh_token'], 'ref');

    final generatedId = await deviceId.get();
    expect(adapter.bodies.single, contains(generatedId),
        reason: 'the body id must be the same one the header carries');
    expect(adapter.seen.single.headers['X-Baytara-Device-ID'], generatedId);
  });

  test('every request carries the BaytaraApp marker', () async {
    build((o, body) async => _json('{"user":$_userJson}', 200));
    await repo.me();
    expect(adapter.seen.single.headers['User-Agent'], contains('BaytaraApp/'));
  });

  test('a GET also carries the language as a query parameter', () async {
    build((o, body) async => _json('{"user":$_userJson}', 200));
    await repo.me();
    expect(adapter.seen.single.uri.queryParameters['lang'], 'ar');
  });

  test('device_limit_reached becomes the typed exception with the device list', () async {
    build((o, body) async => _json(
        '''{"error":"device_limit_reached","max_devices":2,
            "devices":[{"id":1,"device_id":"aaa","label":"Pixel","last_seen":"2026-08-19T10:00:00+00:00"},
                       {"id":2,"device_id":"bbb","label":"iPhone","last_seen":"2026-08-18T09:00:00+00:00"}]}''',
        403));

    ApiException? raw;
    try {
      await repo.login(email: 'o@example.com', password: 'secret123');
    } on ApiException catch (e) {
      raw = e;
    }

    expect(raw, isNotNull);
    expect(raw!.code, ApiErrorCode.deviceLimitReached);

    final limit = asDeviceLimit(raw);
    expect(limit, isNotNull);
    expect(limit!.devices.maxDevices, 2);
    expect(limit.devices.devices.map((d) => d.label), ['Pixel', 'iPhone']);
    expect(limit.devices.devices.first.lastSeen, isNotNull);
    expect(stored.containsKey('baytara_access_token'), isFalse,
        reason: 'a refused sign-in must not leave tokens behind');
  });

  test('a Google account with no phone reports needs_phone', () async {
    build((o, body) async => _json(
        '''{"user":{"id":9,"name":"G","email":"g@example.com","phone":null,
             "role":"student","is_baytarian":false,"is_vet_student":false},
            "needs_phone":true,"access_token":"a","refresh_token":"r"}''',
        201));

    final result = await repo.google('id-token');
    expect(result.needsPhone, isTrue);
    expect(result.user.hasPhone, isFalse);
    expect(adapter.bodies.single, contains('credential'));
  });

  test('needs_phone is derived when the endpoint does not send it', () async {
    build((o, body) async =>
        _json('{"user":$_userJson,"access_token":"a","refresh_token":"r"}', 200));
    final result = await repo.login(email: 'o@example.com', password: 'x');
    expect(result.needsPhone, isFalse, reason: 'this user has a phone');
  });

  test('invalid_credentials surfaces as its own code', () async {
    build((o, body) async => _json('{"error":"invalid_credentials"}', 401));
    await expectLater(
      repo.login(email: 'o@example.com', password: 'wrong'),
      throwsA(isA<ApiException>()
          .having((e) => e.code, 'code', ApiErrorCode.invalidCredentials)),
    );
  });

  test('a phone rejected by the server arrives as a field error', () async {
    build((o, body) async =>
        _json('{"error":"validation","messages":{"phone":["phone_invalid"]}}', 422));
    try {
      await repo.setPhone('+2001');
      fail('should have thrown');
    } on ApiException catch (e) {
      expect(e.fieldErrors['phone'], ['phone_invalid']);
    }
  });

  test('an empty google client id means the button stays hidden', () async {
    build((o, body) async => _json('{"client_id":""}', 200));
    expect(await repo.googleClientId(), isEmpty);
  });

  test('logout clears tokens even when the server call fails', () async {
    build((o, body) async => _json('{"error":"server"}', 500));
    await deviceId.get();
    stored['baytara_access_token'] = 'acc';
    stored['baytara_refresh_token'] = 'ref';

    await repo.logout();

    expect(stored.containsKey('baytara_access_token'), isFalse);
    expect(stored.containsKey('baytara_refresh_token'), isFalse);
    expect(stored.containsKey('baytara_device_id'), isTrue,
        reason: 'the device id identifies the install, not the session');
  });
}
