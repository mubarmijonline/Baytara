/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';

const video = {
  id: 2,
  title: 'Introduction',
  description: 'A free introduction for every visitor.',
  poster: 'https://cdn.example.test/introduction.jpg',
  duration_minutes: 2,
  access_type: 'free',
  can_play: false,
  requires_auth: true,
  requires_phone: false,
  status: 'published',
  category: { id: 1, name: 'Large animals - Cattle & Sheep', slug: 'large-animals' },
};

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function renderRoute(path) {
  window.history.replaceState({}, '', path);
  return render(
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider><App /></AuthProvider>
      </I18nProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_lang', 'en');
  window.scrollTo = vi.fn();
  vi.stubGlobal('fetch', vi.fn((input, options = {}) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/categories')) return json({ categories: [video.category] });
    if (url.includes('/videos/2')) return json({ video });
    if (url.includes('/video/playback') && options.method === 'POST') {
      return json({ otp: 'public-otp', playbackInfo: 'public-playback' });
    }
    if (url.includes('/videos')) return json({ videos: [video], total: 1, page: 1, pages: 1 });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  delete window.VdoPlayer;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows published videos with their category and provider poster', async () => {
  renderRoute('/videos');

  expect(await screen.findByRole('heading', { name: 'Video library' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Introduction' })).toBeVisible();
  expect(screen.getAllByText('Large animals - Cattle & Sheep')).toHaveLength(2);
  expect(screen.getByRole('img', { name: 'Introduction' })).toHaveAttribute(
    'src', 'https://cdn.example.test/introduction.jpg',
  );
});

it('shows free catalog videos on the main website', async () => {
  renderRoute('/');

  expect(await screen.findByRole('heading', { name: 'Free videos for everyone' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Introduction' })).toBeVisible();
});

it('opens a main website category directly in the filtered video library', async () => {
  renderRoute('/');

  expect(await screen.findByRole('img', { name: 'Large animals - Cattle & Sheep' })).toHaveAttribute(
    'src', '/images/categories/large-animals.webp',
  );
  fireEvent.click(await screen.findByRole('button', { name: /Large animals - Cattle & Sheep/i }));
  expect(window.location.pathname).toBe('/videos');
  expect(new URLSearchParams(window.location.search).get('category')).toBe('large-animals');

  await screen.findByRole('heading', { name: 'Video library' });
  const catalogCall = fetch.mock.calls.find(([url]) => String(url).includes('/api/v1/videos?') && String(url).includes('category=large-animals'));
  expect(catalogCall).toBeTruthy();
  expect(String(catalogCall[0])).toContain('category=large-animals');
});

it('shows locked catalog cards with a register action for anonymous viewers', async () => {
  renderRoute('/videos');

  expect(await screen.findByRole('link', { name: /Register to watch Introduction/i })).toHaveAttribute(
    'href', '/auth?next=%2Fvideos%2F2',
  );
  expect(screen.getByRole('img', { name: 'Unlock to watch Introduction' })).toBeVisible();
  expect(screen.getByText('Protected playback')).toBeVisible();
});

it('requires sign in before playing a free video and preserves the return route', async () => {
  renderRoute('/videos/2');

  expect(await screen.findByText('Register to unlock protected playback')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Register to watch' }));
  expect(window.location.pathname).toBe('/auth');
  expect(new URLSearchParams(window.location.search).get('next')).toBe('/videos/2');
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/playback'))).toBe(false);
});

it('plays a free video for a phone-complete authenticated viewer', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  window.VdoPlayer = { getInstance: vi.fn(() => ({
    video: { currentTime: 0, duration: 120, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    api: { getTotalPlayed: vi.fn(() => Promise.resolve(0)), getTotalCovered: vi.fn(() => Promise.resolve(0)) },
  })) };
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/auth/me')) return json({ user: { id: 9, name: 'Viewer', phone: '+201000000000' } });
    if (url.includes('/videos/2')) return json({ video: { ...video, can_play: true, requires_auth: false } });
    if (url.includes('/video/playback') && options.method === 'POST') {
      return json({
        otp: 'viewer-otp',
        playbackInfo: 'viewer-playback',
        session_id: '11111111-1111-4111-8111-111111111111',
      });
    }
    return json({});
  });
  renderRoute('/videos/2');

  fireEvent.click(await screen.findByTestId('video-touch-target'));
  const player = await screen.findByTitle('Introduction');
  expect(player).toHaveAttribute('src', expect.stringContaining('otp=viewer-otp'));
  expect(fetch).toHaveBeenCalledWith('/api/v1/video/playback', expect.objectContaining({
    method: 'POST',
    headers: expect.objectContaining({ Authorization: 'Bearer viewer-token' }),
  }));
});

it('loads the next public video page', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/categories')) return json({ categories: [video.category] });
    if (url.includes('/videos') && url.includes('page=2')) return json({ videos: [{ ...video, id: 3, title: 'Second page video' }], total: 25, page: 2, pages: 2 });
    if (url.includes('/videos')) return json({ videos: [video], total: 25, page: 1, pages: 2 });
    return json({});
  });
  renderRoute('/videos');

  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
  expect(await screen.findByRole('heading', { name: 'Second page video' })).toBeVisible();
  expect(fetch.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true);
});

it('sends the viewer token when loading the video catalog', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  renderRoute('/videos');

  await screen.findByRole('heading', { name: 'Introduction' });
  const catalogCall = fetch.mock.calls.find(([url]) => String(url).includes('/api/v1/videos?'));
  expect(catalogCall[1].headers.Authorization).toBe('Bearer viewer-token');
});

it('retries a public catalog request anonymously when the stored token is stale', async () => {
  localStorage.setItem('baytara_token', 'stale-token');
  let catalogRequests = 0;
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/auth/me')) return json({ user: { id: 9, name: 'Viewer' } });
    if (url.includes('/categories')) return json({ categories: [video.category] });
    if (url.includes('/videos')) {
      catalogRequests += 1;
      if (options.headers?.Authorization) return json({ error: 'unauthorized' }, 401);
      return json({ videos: [video], total: 1, page: 1, pages: 1 });
    }
    return json({});
  });
  renderRoute('/videos');

  expect(await screen.findByRole('heading', { name: 'Introduction' })).toBeVisible();
  expect(catalogRequests).toBe(2);
  expect(localStorage.getItem('baytara_token')).toBeNull();
});

it('shows a sign-in action instead of attempting locked playback', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/videos/2')) return json({ video: { ...video, access_type: 'general', can_play: false } });
    return json({});
  });
  renderRoute('/videos/2');

  expect(await screen.findByRole('button', { name: 'Register to watch' })).toBeVisible();
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/playback'))).toBe(false);
});
