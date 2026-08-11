// Capture-detection probe, enabled per-URL with ?diag=1 — never on for normal viewers.
//
// Collects, in one timeline: page lifecycle, frame timing and geometry (things the browser
// might leak while the screen is recorded) plus the VdoCipher player's own events. The
// player is the component that knows its picture was blanked, so if anything is detectable
// at all, an event of its is the likeliest place for it to show up.
const LINES = [];
const LISTENERS = new Set();
let t0 = 0;

export function diagEnabled() {
  try {
    return new URLSearchParams(window.location.search).get('diag') === '1';
  } catch {
    return false;
  }
}

export function diagLog(what, detail) {
  if (!diagEnabled()) return;
  if (!t0) t0 = performance.now();
  const at = ((performance.now() - t0) / 1000).toFixed(2);
  LINES.push(`${at.padStart(7, ' ')}s  ${what}${detail !== undefined ? '  ' + detail : ''}`);
  if (LINES.length > 600) LINES.shift();
  LISTENERS.forEach((fn) => fn(LINES));
}

export function diagSubscribe(fn) {
  LISTENERS.add(fn);
  fn(LINES);
  return () => LISTENERS.delete(fn);
}

export function diagLines() {
  return LINES;
}
