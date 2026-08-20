#!/usr/bin/env bash
# Round-trips the Dart audio watermark through the backend's own decoder.
#
# This is the acceptance check for the watermark, and it is not optional: the encoder and
# backend/tools/decode_audio_watermark.py must agree exactly or a leaked recording cannot be
# traced to an account. Unit tests on the wire format alone would not have caught the bug
# this script found first time (a clip exactly one frame long is never scanned, because the
# decoder's loop condition is `position + step * 11 < len(samples)`).
#
#   ./tool/verify_watermark.sh
set -euo pipefail

cd "$(dirname "$0")/.."
DECODER="../backend/tools/decode_audio_watermark.py"

if [[ ! -f "$DECODER" ]]; then
  echo "decoder not found at $DECODER" >&2
  exit 1
fi

echo "rendering fixtures..."
flutter test test/audio_watermark_test.dart >/dev/null

echo "decoding with the backend decoder..."
python3 - "$DECODER" <<'PY'
import glob, importlib.util, os, struct, sys, wave

spec = importlib.util.spec_from_file_location('dec', sys.argv[1])
dec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dec)

fixtures = sorted(glob.glob('build/watermark_fixtures/*.wav'))
if not fixtures:
    sys.exit('no fixtures were rendered')

ok = True
for path in fixtures:
    expected = int(os.path.basename(path)[len('account_'):-len('.wav')])
    with wave.open(path, 'rb') as w:
        frames = w.readframes(w.getnframes())
        samples = list(struct.unpack('<%dh' % (len(frames) // 2), frames))
    ids = [f['account_id'] for f in dec.decode(samples)]
    good = ids == [expected]
    ok = ok and good
    print(f"  {'PASS' if good else 'FAIL'}  {expected:>10}  ->  {ids}")

print()
print('watermark round trip:', 'OK' if ok else 'MISMATCH')
sys.exit(0 if ok else 1)
PY
