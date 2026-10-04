#!/usr/bin/env bash
#
# Writes the two files that make a baytara.app link open the app instead of the browser:
#
#   .well-known/assetlinks.json              Android App Links
#   .well-known/apple-app-site-association   iOS Universal Links
#
# Neither is written by hand, because each carries a value from outside the project: the
# release signing fingerprint on Android, and the Apple team id on iOS. A placeholder in
# either file is worse than an absent file - the OS reads it, fails to match, and silently
# stops handing links to the app, with no error anyone sees. So each file is written only
# once its own value is given, and neither waits on the other.
#
# Commit what it writes. Both files are public by design (anyone can fetch them from the
# site), and a committed file ships with every build of main rather than only from the one
# checkout the script happened to run in.
#
# The package name and bundle id are READ from the project rather than typed here, so they
# cannot drift from what actually ships.
#
# Usage:
#   ANDROID_CERT_SHA256="AA:BB:..." APPLE_TEAM_ID=ABCDE12345 deploy/gen_applinks.sh
#   deploy/gen_applinks.sh --keystore ~/baytara-release.jks --alias baytara
#   APPLE_TEAM_ID=ABCDE12345 deploy/gen_applinks.sh      # the iOS file alone
#
# Several fingerprints may be given, comma separated, which is what you want while a debug
# build is being tested against the live site alongside the release one.
#
# Verify after deploying:
#   curl -sS https://baytara.app/.well-known/assetlinks.json | jq .
#   curl -sSI https://baytara.app/.well-known/apple-app-site-association | grep -i content-type
#   curl -sS https://app-site-association.cdn-apple.com/a/v1/baytara.app | jq .
#   adb shell pm verify-app-links --re-verify app.baytara.app
#
# iOS 14+ devices read Apple's CDN copy (the cdn-apple.com curl), not the site's. The CDN
# refreshes on its own schedule, so it can lag a deploy.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$repo/frontend/web/public/.well-known"
gradle="$repo/mobile_app/android/app/build.gradle.kts"
pbxproj="$repo/mobile_app/ios/Runner.xcodeproj/project.pbxproj"

keystore=""
alias=""
while [ $# -gt 0 ]; do
  case "$1" in
    --keystore) keystore="$2"; shift 2 ;;
    --alias)    alias="$2";    shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

# --- the two identifiers, read from the project ------------------------------------------

package="$(sed -n 's/.*applicationId = "\([^"]*\)".*/\1/p' "$gradle" | head -1)"
[ -n "$package" ] || { echo "could not read applicationId from $gradle" >&2; exit 1; }

bundle="$(sed -n 's/.*PRODUCT_BUNDLE_IDENTIFIER = \([^;]*\);.*/\1/p' "$pbxproj" \
          | grep -v RunnerTests | head -1)"
[ -n "$bundle" ] || { echo "could not read PRODUCT_BUNDLE_IDENTIFIER from $pbxproj" >&2; exit 1; }

# --- the team id --------------------------------------------------------------------------

# Ten upper-case letters and digits. A mistyped id is no better than a placeholder: the file
# publishes cleanly and then matches no app.
team="${APPLE_TEAM_ID:-}"
if [ -n "$team" ] && ! [[ "$team" =~ ^[A-Z0-9]{10}$ ]]; then
  echo "APPLE_TEAM_ID must be 10 upper-case letters and digits, got: $team" >&2
  exit 2
fi

# --- the fingerprint ----------------------------------------------------------------------

fingerprints="${ANDROID_CERT_SHA256:-}"
if [ -z "$fingerprints" ] && [ -n "$keystore" ]; then
  command -v keytool >/dev/null || { echo "keytool not found; install a JDK" >&2; exit 1; }
  [ -n "$alias" ] || { echo "--keystore needs --alias" >&2; exit 2; }
  # -storepass is deliberately not an argument: it would land in the shell history.
  fingerprints="$(keytool -list -v -keystore "$keystore" -alias "$alias" \
                  | awk '/SHA256:/ { print $2; exit }')"
fi

if [ -z "$fingerprints" ]; then
  cat >&2 <<'MSG'
No signing fingerprint, so no assetlinks.json.

Android App Links verify against the certificate the APK/AAB is actually signed with, so
this file cannot be generated before the release keystore exists. Today mobile_app still
signs release builds with the debug key (android/app/build.gradle.kts), which is also why
no release build can be uploaded to Play yet - the same missing piece blocks both.

Once the keystore exists:
  deploy/gen_applinks.sh --keystore <path> --alias <alias>

Or, if Play App Signing is on, take the SHA-256 from the Play Console (Setup > App
integrity > App signing key certificate) - that is the key Google re-signs with, and the
one users' devices see:
  ANDROID_CERT_SHA256="AA:BB:..." deploy/gen_applinks.sh
MSG
fi

if [ -z "$fingerprints" ] && [ -z "$team" ]; then
  echo "APPLE_TEAM_ID is not set either - nothing written." >&2
  exit 1
fi

# --- write --------------------------------------------------------------------------------

mkdir -p "$out"

if [ -n "$fingerprints" ]; then
  {
    printf '[{\n  "relation": ["delegate_permission/common.handle_all_urls"],\n'
    printf '  "target": {\n    "namespace": "android_app",\n    "package_name": "%s",\n' "$package"
    printf '    "sha256_cert_fingerprints": ['
    first=1
    IFS=',' read -ra prints <<< "$fingerprints"
    for p in "${prints[@]}"; do
      p="$(echo "$p" | tr -d '[:space:]')"
      [ -n "$p" ] || continue
      [ $first -eq 1 ] || printf ', '
      printf '"%s"' "$p"
      first=0
    done
    printf ']\n  }\n}]\n'
  } > "$out/assetlinks.json"
fi

if [ -n "$team" ]; then
  # `components` rather than the older `paths`: the app targets iOS 15.
  # The path list must stay in step with the intent filters in AndroidManifest.xml and with
  # locationForLink() in mobile_app/lib/core/links/app_link.dart. Claiming a path none of
  # the three agree on means a link that opens the app and then shows nothing.
  cat > "$out/apple-app-site-association" <<JSON
{
  "applinks": {
    "details": [
      {
        "appIDs": ["${team}.${bundle}"],
        "components": [
          { "/": "/library", "comment": "the library shelf" },
          { "/": "/library/*", "comment": "one book summary" },
          { "/": "/blog", "comment": "the blog index, which is the library" },
          { "/": "/blog/*", "comment": "one article, as the website addresses it" },
          { "/": "/articles/*", "comment": "one article, as the app addresses it" },
          { "/": "/payment/callback*", "comment": "the gateway's return" }
        ]
      }
    ]
  }
}
JSON
else
  echo "APPLE_TEAM_ID not set - wrote assetlinks.json only, no Universal Links file." >&2
fi

echo "wrote:"
ls -1 "$out"
echo
echo "These ship with the website build (Vite copies public/ into dist/). Commit them, deploy"
echo "the site, then re-verify on a device: a link only re-checks when the app is installed or"
echo "updated."
