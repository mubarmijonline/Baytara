// Turning a path the API returned into something a player or an Image can actually fetch.
import 'dio_client.dart';

/// Resolves a media path from the API against the API origin.
///
/// Uploads come back **relative** ("/api/v1/uploads/x.jpg", "/api/v1/video/hls/12/master.m3u8")
/// while provider-hosted URLs come back absolute. Handing a relative path to NetworkImage
/// fails silently, which is why no instructor avatar appeared in the app until this existed;
/// handing one to a video player fails loudly but no more usefully.
String? resolveMediaUrl(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final value = raw.trim();
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  // kApiBaseUrl ends in /api/v1 and these paths already begin with it, so the origin is
  // what gets prefixed, not the whole base.
  final origin = Uri.parse(kApiBaseUrl).origin;
  return value.startsWith('/') ? '$origin$value' : '$origin/$value';
}
