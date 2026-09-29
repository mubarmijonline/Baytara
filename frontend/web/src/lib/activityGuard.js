// Viewer activity guard.
//
// A browser is never told that a screen recording started — that was measured on real
// hardware (docs/VIDEO_PROTECTION.md). What a page CAN see is a deliberate capture action:
// the screenshot key, the save/print/view-source shortcuts, DevTools opening. This watches
// for those, pauses playback and reports each one to the session.
//
// What it must NOT do is treat ordinary viewing as an attack. Switching tab, answering a
// notification, or the phone locking are all normal, and they used to be reported as
// `suspicious` and counted: three of them in fifteen minutes blocked the account from
// playback and notified every admin. A learner who glanced at another tab twice lost the
// stream. So the signals are split in two, and only one of them escalates:
//
//   capture attempt  deliberate, and worth acting on -> pause, report, count a strike
//   interruption     ordinary, and worth nothing     -> pause only, never reported
//
// Right-click and copy are still blocked as a deterrent, but no longer reported: clicking
// the wrong mouse button is not evidence of anything.

const SHORTCUT_KEYS = new Set(['s', 'u', 'p']);      // save / view-source / print
const DEVTOOLS_GAP = 170;                             // px of chrome that suggests a docked panel
const REPEAT_WINDOW_MS = 5 * 60 * 1000;               // same as the app's guard

export function startActivityGuard({ onCaptureAttempt, onInterrupted }) {
  let stopped = false;
  let devtoolsReported = false;
  // Measured once, so a browser that already has a sidebar open or a zoom level other
  // than 100% is not permanently mistaken for one with DevTools docked. That absolute
  // comparison flagged every zoomed-in viewer from the first frame.
  const baseGapWidth = window.outerWidth - window.innerWidth;
  const baseGapHeight = window.outerHeight - window.innerHeight;

  // One report per reason per five minutes. A key held down, or a recorder that keeps
  // the window out of focus, must not spend the account's whole allowance in a second.
  const lastReported = new Map();

  const report = (reason, { pause = true } = {}) => {
    if (stopped) return;
    const now = Date.now();
    const previous = lastReported.get(reason);
    if (previous && now - previous < REPEAT_WINDOW_MS) return;
    lastReported.set(reason, now);
    onCaptureAttempt?.(reason, { pause });
  };

  // Playback should stop when nobody is looking, but nothing is being accused.
  const interrupt = (reason) => {
    if (stopped) return;
    onInterrupted?.(reason);
  };

  const onKeyUp = (event) => {
    // PrintScreen only ever arrives as keyup, and only on Windows/Linux.
    if (event.key === 'PrintScreen' || event.code === 'PrintScreen') report('printscreen');
  };

  const onKeyDown = (event) => {
    const key = String(event.key || '').toLowerCase();
    if ((event.ctrlKey || event.metaKey) && SHORTCUT_KEYS.has(key)) {
      event.preventDefault();
      report(`shortcut_${key}`);
    }
    // macOS screenshot chords: the OS usually swallows them, but catch them when it does not
    if (event.metaKey && event.shiftKey && ['3', '4', '5'].includes(key)) report('mac_screenshot');
    // Windows snipping tool
    if (event.shiftKey && event.metaKey && key === 's') report('snip');
  };

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') interrupt('page_hidden');
  };

  const onBlur = () => interrupt('window_blur');

  const devtoolsTick = () => {
    if (stopped) return;
    const wide = (window.outerWidth - window.innerWidth) - baseGapWidth > DEVTOOLS_GAP;
    const tall = (window.outerHeight - window.innerHeight) - baseGapHeight > DEVTOOLS_GAP;
    if ((wide || tall) && !devtoolsReported) {
      devtoolsReported = true;
      // Audit only. The measurement cannot tell a docked panel from a zoom change made
      // mid-lesson, and a guess that stops the picture is worse than one that does not.
      report('devtools_open', { pause: false });
    } else if (!wide && !tall) {
      devtoolsReported = false;
    }
  };

  // Blocked as a deterrent, deliberately not reported.
  const swallow = (event) => event.preventDefault();

  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', onBlur);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('contextmenu', swallow);
  document.addEventListener('copy', swallow);
  const timer = setInterval(devtoolsTick, 1500);

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('contextmenu', swallow);
    document.removeEventListener('copy', swallow);
  };
}
