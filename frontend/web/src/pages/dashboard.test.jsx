/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { setToken } from '../lib/api.js';
import { I18nProvider } from '../lib/i18n.jsx';

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
  setToken('student-token');
  window.scrollTo = vi.fn();
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/auth/me')) return json({
      user: {
        id: 7,
        name: 'Rana Student',
        email: 'rana@example.test',
        phone: '+201099999999',
        role: 'student',
        is_baytarian: true,
      },
    });
    if (url.includes('/baytarian/me')) return json({
      is_baytarian: true,
      request: { id: 3, status: 'approved', created_at: '2026-08-01T10:00:00Z', reviewed_at: '2026-08-02T10:00:00Z' },
    });
    if (url.includes('/payment/mine')) return json({
      payments: [{ id: 55, kind: 'enroll', status: 'pending', amount: 500, currency: 'EGP', created_at: '2026-08-03T10:00:00Z' }],
    });
    if (url.includes('/video/my-progress')) return json({
      videos: [{
        id: 9,
        title: 'Free intro video',
        category: 'large-animals',
        access_type: 'free',
        status: 'playing',
        completion_percent: 66,
        watched_seconds: 198,
        duration_seconds: 300,
        last_event_at: '2026-08-05T10:12:00Z',
      }],
    });
    if (url.includes('/auth/devices')) return json({ devices: [], max_devices: 2 });
    if (url.includes('/enrollments')) return json({
      enrollments: [{
        id: 11,
        source: 'purchase',
        status: 'active',
        expires_at: null,
        is_expired: false,
        course: {
          id: 4,
          title: 'Equine Surgery',
          slug: 'equine-surgery',
          category: { name: 'Equine' },
          instructor: { name: 'Dr. Ahmed' },
        },
        progress: {
          percent: 34,
          completed_lessons: 1,
          watched_lessons: 3,
          watched_not_completed: 2,
          total_lessons: 6,
        },
      }],
    });
    if (url.includes('/courses')) return json({ courses: [] });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows the student learning, request, and verification overview from live account data', async () => {
  renderRoute('/dashboard');

  expect(await screen.findByRole('heading', { name: /student dashboard/i })).toBeVisible();
  expect(screen.getAllByText('Verified as Pet Doctor').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Registered courses').length).toBeGreaterThan(0);
  expect(await screen.findByText('Equine Surgery')).toBeVisible();
  expect(screen.getByText('Watched not completed')).toBeVisible();
  expect(screen.getByText('2')).toBeVisible();
  expect(screen.getByText('Recent requests')).toBeVisible();
  expect(screen.getByText('Payment review pending')).toBeVisible();
  expect(screen.getByText('Continue watching')).toBeVisible();
  expect(screen.getByText('Free intro video')).toBeVisible();
  expect(screen.getByText('66% watched')).toBeVisible();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/v1/baytarian/me', expect.any(Object)));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/v1/video/my-progress', expect.any(Object)));
});
