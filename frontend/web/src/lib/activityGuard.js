// Viewer activity guard.
//
// A browser is never told that a screen recording started — that was measured on real
// hardware (docs/VIDEO_PROTECTION.md). What a page CAN see is the behaviour that usually
// surrounds a capture attempt: the screenshot key, save/print shortcuts, DevTools opening,
// the tab being shared, the page being hidden. This watches for those, pauses playback and
// reports each one to the session so the admin sees who is doing it.
//
// Be clear about what this is: a deterrent and an audit trail, not a block. A recorder that
// simply runs while the viewer watches normally triggers nothing.

const SHORTCUT_KEYS = new Set(['s', 'u', 'p']);      // save / view-source / print
const DEVTOOLS_GAP = 170;                             // px of chrome that suggests a docked panel

export function startActivityGuard({ onSuspicious, onPause }) {
  let stopped = false;
  let devtoolsReported = false;
  let baselineHeight = window.innerHeight;

  const report = (reason, { pause = true } = {}) => {
    if (stopped) return;
    onSuspicious?.(reason);
    if (pause) onPause?.(reason);
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
    if (document.visibilityState === 'hidden') report('page_hidden');
  };

  const onBlur = () => report('window_blur');

  const onResize = () => {
    // A shared tab loses height to the "you are sharing" bar; a big shrink is worth noting.
    const drop = baselineHeight - window.innerHeight;
    if (drop > 60 && drop < 220) report('viewport_shrank', { pause: false });
    baselineHeight = Math.max(baselineHeight, window.innerHeight);
  };

  const devtoolsTick = () => {
    if (stopped) return;
    const wide = window.outerWidth - window.innerWidth > DEVTOOLS_GAP;
    const tall = window.outerHeight - window.innerHeight > DEVTOOLS_GAP;
    if ((wide || tall) && !devtoolsReported) {
      devtoolsReported = true;
      report('devtools_open');
    } else if (!wide && !tall) {
      devtoolsReported = false;
    }
  };

  const onContextMenu = (event) => { event.preventDefault(); report('context_menu', { pause: false }); };
  const onCopy = () => report('copy', { pause: false });

  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('copy', onCopy);
  const timer = setInterval(devtoolsTick, 1500);

  return () => {
    stopped = true;
    clearInterval(timer);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('blur', onBlur);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('contextmenu', onContextMenu);
    document.removeEventListener('copy', onCopy);
  };
}
