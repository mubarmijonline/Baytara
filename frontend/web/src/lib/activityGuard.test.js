/* @vitest-environment jsdom */
// What counts as a capture attempt, and what is just someone using a browser.
//
// The bug this pins: switching tab, blurring the window and right-clicking were all
// reported as `suspicious`. Three reports in fifteen minutes blocks the account from
// playback for a quarter of an hour and notifies every admin, so a learner who glanced
// at another tab twice lost the stream and paged the team.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startActivityGuard } from './activityGuard.js';

let captured;
let interrupted;
let stop;

function startGuard() {
  captured = [];
  interrupted = [];
  stop = startActivityGuard({
    onCaptureAttempt: (reason, options) => captured.push([reason, options]),
    onInterrupted: (reason) => interrupted.push(reason),
  });
}

function hide(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  window.innerWidth = 1000; window.outerWidth = 1000;
  window.innerHeight = 800; window.outerHeight = 800;
  startGuard();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ordinary browsing is never an offence', () => {
  it('switching tab pauses but reports nothing', () => {
    hide('hidden');
    expect(interrupted).toEqual(['page_hidden']);
    expect(captured).toEqual([]);
  });

  it('blurring the window pauses but reports nothing', () => {
    window.dispatchEvent(new Event('blur'));
    expect(interrupted).toEqual(['window_blur']);
    expect(captured).toEqual([]);
  });

  it('right-click and copy are blocked without being reported', () => {
    const menu = new Event('contextmenu', { cancelable: true });
    const copy = new Event('copy', { cancelable: true });
    document.dispatchEvent(menu);
    document.dispatchEvent(copy);
    expect(menu.defaultPrevented).toBe(true);
    expect(copy.defaultPrevented).toBe(true);
    expect(captured).toEqual([]);
    expect(interrupted).toEqual([]);
  });

  it('resizing the window is not reported at all', () => {
    // The old "a share bar stole some height" guess fired on the on-screen keyboard,
    // a rotation, and the bookmarks bar.
    window.innerHeight = 700;
    window.dispatchEvent(new Event('resize'));
    expect(captured).toEqual([]);
  });
});

describe('deliberate capture actions are reported and pause', () => {
  it('PrintScreen', () => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'PrintScreen' }));
    expect(captured).toEqual([['printscreen', { pause: true }]]);
  });

  it('the macOS screenshot chord', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '4', metaKey: true, shiftKey: true }));
    expect(captured[0][0]).toBe('mac_screenshot');
  });

  it('save is blocked as well as reported', () => {
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(captured[0][0]).toBe('shortcut_s');
  });
});

describe('repeat reports', () => {
  it('the same reason is reported once per five minutes', () => {
    for (let i = 0; i < 6; i += 1) {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'PrintScreen' }));
    }
    // A held key would otherwise spend the account's whole fifteen-minute allowance at once.
    expect(captured).toHaveLength(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'PrintScreen' }));
    expect(captured).toHaveLength(2);
  });

  it('a different reason is never swallowed by another reason throttle', () => {
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'PrintScreen' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }));
    expect(captured.map(([reason]) => reason)).toEqual(['printscreen', 'shortcut_p']);
  });
});

describe('DevTools detection', () => {
  it('does not fire for a browser that was already zoomed or had a sidebar open', () => {
    // A page at 150% zoom reports a large gap from the first frame. Measuring against
    // that baseline is what stops every zoomed viewer being flagged permanently.
    stop();
    window.innerWidth = 600;    // gap of 400px, present before playback started
    startGuard();
    vi.advanceTimersByTime(2000);
    expect(captured).toEqual([]);
  });

  it('fires once, without pausing, when the gap grows mid-lesson', () => {
    window.innerHeight = 500;   // 300px taller gap than the baseline
    vi.advanceTimersByTime(2000);
    expect(captured).toEqual([['devtools_open', { pause: false }]]);

    vi.advanceTimersByTime(2000);
    expect(captured).toHaveLength(1);
  });
});

it('stops listening once torn down', () => {
  stop();
  window.dispatchEvent(new KeyboardEvent('keyup', { key: 'PrintScreen' }));
  hide('hidden');
  expect(captured).toEqual([]);
  expect(interrupted).toEqual([]);
});
