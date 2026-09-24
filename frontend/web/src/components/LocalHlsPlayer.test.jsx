/* @vitest-environment jsdom */

// The watermark and full screen.
//
// The rule these tests hold down: **the <video> element must never be the thing that goes
// full screen.** The identity watermark is a sibling of it, so a video that goes full
// screen on its own leaves the mark behind on the page, at the moment it matters most.
//
// Two earlier attempts failed in ways worth remembering. Hiding the native button with
// `controlsList="nofullscreen"` works on desktop Chromium and not on Android Chrome, so
// the player showed two buttons. Catching the browser's own request and redirecting it lost
// the user gesture, so Android flashed and came back, and an iPhone — which has no element
// full screen at all — opened iOS's own player instead.
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import LocalHlsPlayer from './LocalHlsPlayer.jsx';

vi.mock('hls.js', () => ({
  default: class {
    static isSupported() { return false; }
  },
}));

const playback = {
  kind: 'local',
  url: 'https://baytara.app/api/v1/video/hls/9/master.m3u8?t=token',
  session_id: '11111111-1111-4111-8111-111111111111',
  watermark: 'د. أحمد ذياب · 0100 000 0000',
  resume_position_seconds: 0,
};

beforeEach(() => {
  document.fullscreenEnabled = true;
  document.exitFullscreen = vi.fn(() => Promise.resolve());
  Element.prototype.requestFullscreen = vi.fn(() => Promise.resolve());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete document.fullscreenElement;
});

it('gives the video no controls of its own', () => {
  // Native controls are the only thing that can put the bare video full screen, and on
  // iOS that means handing it to a player no overlay can reach.
  render(<LocalHlsPlayer playback={playback} title="Lesson" />);
  const video = document.querySelector('video');

  expect(video).not.toHaveAttribute('controls');
  // playsInline is what stops iOS doing the same thing on play.
  expect(video.playsInline).toBe(true);
});

it('offers exactly one full screen control', () => {
  render(<LocalHlsPlayer playback={playback} title="Lesson" />);
  expect(screen.getAllByTestId('local-video-fullscreen')).toHaveLength(1);
});

it('puts the shell into full screen, not the bare video, from the click itself', () => {
  render(<LocalHlsPlayer playback={playback} title="Lesson" />);

  fireEvent.click(screen.getByTestId('local-video-fullscreen'));

  expect(Element.prototype.requestFullscreen).toHaveBeenCalledTimes(1);
  const target = Element.prototype.requestFullscreen.mock.instances[0];
  const shell = screen.getByTestId('local-video-shell');
  expect(target).toBe(shell);
  // ...and the watermark is inside it, so it travels with the picture.
  expect(shell).toContainElement(screen.getByTestId('local-video-watermark'));
});

it('pins the shell where the browser has no element full screen', () => {
  // An iPhone. There is no Element.requestFullscreen, so the fallback is to cover the
  // viewport with CSS: not the OS full screen, but it fills the screen and keeps the
  // watermark, which the native player cannot.
  document.fullscreenEnabled = false;
  document.webkitFullscreenEnabled = false;
  render(<LocalHlsPlayer playback={playback} title="Lesson" />);

  fireEvent.click(screen.getByTestId('local-video-fullscreen'));

  expect(Element.prototype.requestFullscreen).not.toHaveBeenCalled();
  expect(screen.getByTestId('local-video-shell')).toHaveClass('secure-video-shell-pinned');
  expect(screen.getByTestId('local-video-shell'))
    .toContainElement(screen.getByTestId('local-video-watermark'));
});

it('falls back to pinning when the browser refuses the request', () => {
  // Rather than leaving the viewer with a button that visibly does nothing, which is what
  // Android did while the request was being made outside the user gesture.
  Element.prototype.requestFullscreen = vi.fn(() => Promise.reject(new Error('denied')));
  render(<LocalHlsPlayer playback={playback} title="Lesson" />);

  fireEvent.click(screen.getByTestId('local-video-fullscreen'));

  return waitFor(() => {
    expect(screen.getByTestId('local-video-shell')).toHaveClass('secure-video-shell-pinned');
  });
});

it('the play control drives the video', () => {
  render(<LocalHlsPlayer playback={playback} title="Lesson" />);
  const video = document.querySelector('video');
  video.play = vi.fn();
  video.pause = vi.fn();

  fireEvent.click(screen.getByTestId('local-video-play'));
  expect(video.play).toHaveBeenCalled();
});
