/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SecureVdoPlayer from './SecureVdoPlayer.jsx';
import { setToken } from '../lib/api.js';

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function fakePlayer() {
  const listeners = new Map();
  const video = {
    currentTime: 0,
    duration: 120,
    addEventListener: vi.fn((name, handler) => listeners.set(name, handler)),
    removeEventListener: vi.fn((name, handler) => {
      if (listeners.get(name) === handler) listeners.delete(name);
    }),
  };
  const player = {
    video,
    api: {
      getTotalPlayed: vi.fn(() => Promise.resolve(0)),
      getTotalCovered: vi.fn(() => Promise.resolve(0)),
    },
  };
  return { player, listeners };
}

const playback = {
  otp: 'short-lived-otp',
  playbackInfo: 'short-lived-playback',
  session_id: '11111111-1111-4111-8111-111111111111',
};

beforeEach(() => {
  localStorage.clear();
  setToken('viewer-token');
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-08-01T17:00:00Z'));
});

afterEach(() => {
  cleanup();
  delete window.VdoPlayer;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('reports official player transitions and throttles heartbeats', async () => {
  const { player, listeners } = fakePlayer();
  window.VdoPlayer = { getInstance: vi.fn(() => player) };
  const bodies = [];
  vi.stubGlobal('fetch', vi.fn((input, options = {}) => {
    if (String(input).includes('/events')) {
      bodies.push(JSON.parse(options.body));
      return json({ session: { status: 'playing' } });
    }
    return json({});
  }));
  const onEnded = vi.fn();
  const view = render(<SecureVdoPlayer playback={playback} title="Introduction" onEnded={onEnded} />);

  await waitFor(() => expect(window.VdoPlayer.getInstance).toHaveBeenCalled());
  await act(async () => listeners.get('play')());
  expect(bodies.map((body) => body.type)).toEqual(['play']);

  player.video.currentTime = 10;
  player.api.getTotalPlayed.mockResolvedValue(10);
  player.api.getTotalCovered.mockResolvedValue(9);
  await act(async () => listeners.get('timeupdate')());
  expect(bodies.map((body) => body.type)).toEqual(['play']);

  vi.setSystemTime(new Date('2026-08-01T17:00:16Z'));
  await act(async () => listeners.get('timeupdate')());
  expect(bodies.map((body) => body.type)).toEqual(['play', 'heartbeat']);

  await act(async () => listeners.get('pause')());
  await act(async () => listeners.get('play')());
  await act(async () => listeners.get('ended')());
  expect(bodies.map((body) => body.type)).toEqual(['play', 'heartbeat', 'pause', 'resume', 'ended']);
  expect(onEnded).toHaveBeenCalledTimes(1);

  view.unmount();
  expect(player.video.removeEventListener).toHaveBeenCalledTimes(5);
});

it('retries a failed event with the same client event id', async () => {
  const { player, listeners } = fakePlayer();
  window.VdoPlayer = { getInstance: vi.fn(() => player) };
  const bodies = [];
  let requests = 0;
  vi.stubGlobal('fetch', vi.fn((input, options = {}) => {
    if (!String(input).includes('/events')) return json({});
    requests += 1;
    bodies.push(JSON.parse(options.body));
    return requests === 1 ? json({ error: 'temporary' }, 503) : json({ session: { status: 'playing' } });
  }));

  render(<SecureVdoPlayer playback={playback} title="Introduction" />);
  await waitFor(() => expect(window.VdoPlayer.getInstance).toHaveBeenCalled());
  await act(async () => listeners.get('play')());
  await waitFor(() => expect(requests).toBe(2));
  expect(bodies[0].event_id).toBe(bodies[1].event_id);
});

it('uses a backend-valid UUID when randomUUID is unavailable', async () => {
  const { player, listeners } = fakePlayer();
  window.VdoPlayer = { getInstance: vi.fn(() => player) };
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes) => {
      bytes.fill(7);
      return bytes;
    },
  });
  let body;
  vi.stubGlobal('fetch', vi.fn((input, options = {}) => {
    if (String(input).includes('/events')) body = JSON.parse(options.body);
    return json({ session: { status: 'playing' } });
  }));

  render(<SecureVdoPlayer playback={playback} title="Introduction" />);
  await waitFor(() => expect(window.VdoPlayer.getInstance).toHaveBeenCalled());
  await act(async () => listeners.get('play')());
  expect(body.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
