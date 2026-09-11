/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';
import { resetBrowserSupport } from '../lib/browserSupport.js';

const lessons = [
  { id: 11, title: 'Welcome', duration_minutes: 4, access_type: 'free', has_video: true },
  { id: 12, title: 'Core concepts', duration_minutes: 56, access_type: 'baytarian', has_video: true },
];

const course = {
  id: 7, slug: 'cattle', title: 'Cattle disease basics', status: 'published',
  access_type: 'baytarian', lessons_count: 2, video_minutes: 60,
  category: { id: 1, name: 'Large animals', slug: 'large-animals' },
  instructor: { id: 3, name: 'Dr Ahmed', headline: 'Cattle consultant', avatar_url: null },
  videos: lessons,
  modules: [{ id: 4, title: 'Unit one', lessons_count: 2, total_minutes: 60, videos: lessons }],
};

const progress = {
  enrolled: true, expired: false, percent: 50, completed: 1, total: 2,
  lessons: { 11: { completed: true, watched_seconds: 240 }, 12: { completed: false, watched_seconds: 30 } },
};

function json(data) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

function mockApi({ caps = { protected: true, blocked: null, platform: 'mac' } } = {}) {
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.includes('/video/capabilities')) return json(caps);
    if (url.includes('/video/playback')) {
      return json({ otp: 'viewer-otp', playbackInfo: 'info', session_id: 's1' });
    }
    if (url.includes('/progress')) return json(progress);
    if (url.includes('/courses/cattle')) return json({ course });
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/courses')) return json({ courses: [], total: 0, pages: 1 });
    if (url.includes('/videos')) return json({ videos: [], total: 0, pages: 1 });
    return json({});
  }));
}

function renderLesson(lessonId = 12) {
  window.history.replaceState({}, '', `/learn/cattle/${lessonId}`);
  return render(
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider><App /></AuthProvider>
      </I18nProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  resetBrowserSupport();
  localStorage.clear();
  localStorage.setItem('baytara_lang', 'en');
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('never requests playback for an anonymous viewer', async () => {
  mockApi();
  renderLesson();

  expect(await screen.findByRole('heading', { name: 'Core concepts', level: 1 })).toBeVisible();
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/playback'))).toBe(false);
});

it('plays the lesson and shows real course progress when signed in', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi();
  renderLesson();

  const player = await screen.findByTitle('Core concepts');
  expect(player).toHaveAttribute('src', expect.stringContaining('otp=viewer-otp'));
  expect(screen.getByText('50%')).toBeVisible();
  expect(screen.getByText('Lesson 2 of 2', { selector: 'span' })).toBeVisible();
  // watched but not completed -> the in-progress chip, derived not invented
  expect(screen.getByText('In progress')).toBeVisible();
});

it('groups the sidebar by unit and marks completed lessons', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi();
  renderLesson();

  expect(await screen.findByRole('button', { name: /Unit one/ })).toBeVisible();
  const welcome = await screen.findByRole('button', { name: /Welcome/ });
  fireEvent.click(welcome);
  await waitFor(() => expect(window.location.pathname).toBe('/learn/cattle/11'));
});

it('offers the all-content browser as a second sidebar tab', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi();
  renderLesson();

  fireEvent.click(await screen.findByRole('button', { name: 'All content' }));
  expect(await screen.findByRole('searchbox', { name: /Search courses and videos/ })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Large animals' })).toBeVisible();
});

it('shows the guidance screen instead of minting on a browser the server would refuse', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi({ caps: { protected: false, blocked: 'browser_not_supported', platform: 'windows' } });
  renderLesson(12);   // paid lesson

  expect(await screen.findByTestId('browser-block')).toBeVisible();
  expect(screen.getByText('Open this page in Microsoft Edge.')).toBeVisible();
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/capabilities'))).toBe(true));
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/video/playback'))).toBe(false);
});

it('still plays a free lesson on an unprotected browser, with a nudge', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi({ caps: { protected: false, blocked: null, platform: 'windows' } });
  renderLesson(11);   // free lesson

  const player = await screen.findByTitle('Welcome');
  expect(player).toHaveAttribute('src', expect.stringContaining('otp=viewer-otp'));
  expect(screen.getByTestId('browser-nudge')).toHaveTextContent('Open this page in Microsoft Edge.');
});
