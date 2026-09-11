// Which browsers can protect a paid video, asked of the server rather than guessed here.
//
// The rules live in one place, backend/app/utils.py, and GET /video/capabilities runs
// them on this request's User-Agent exactly as the mint will. The page uses the answer
// to show guidance *before* a failed player, not to grant anything: the server still
// refuses the OTP on its own, so a spoofed answer here changes nothing that matters.
import { useEffect, useState } from 'react';
import { webapi } from './api.js';

// Fail open. If the check itself cannot be reached the mint still enforces policy, and a
// learner on a good browser must not be told otherwise because a request timed out.
const OPEN = { protected: true, blocked: null, platform: 'other' };

let cached;

// The answer is per browser, so one request serves the whole visit. Tests stub a
// different answer per case and need the cache gone between them.
export function resetBrowserSupport() {
  cached = undefined;
}

export function getCapabilities() {
  if (!cached) {
    cached = webapi.capabilities()
      .then((r) => ({ ...OPEN, ...(r || {}) }))
      .catch(() => OPEN);
  }
  return cached;
}

export function useBrowserSupport() {
  const [caps, setCaps] = useState(null);
  useEffect(() => {
    let alive = true;
    getCapabilities().then((r) => alive && setCaps(r));
    return () => { alive = false; };
  }, []);
  return caps;
}

// Mirrors capture_protected() in backend/app/services/catalog_access.py: paid tiers
// always, free ones only when an admin ticked the flag.
export function captureProtected(video) {
  if (!video) return false;
  return video.access_type === 'baytarian' || video.access_type === 'general' || !!video.is_protected;
}
