/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { setToken } from '../lib/api.js';
import { I18nProvider } from '../lib/i18n.jsx';
import { clearPublicCache } from '../lib/api.js';

function json(data) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

beforeEach(() => {
  clearPublicCache();   // module-level, and vitest isolates per file not per test
  localStorage.clear();
  localStorage.setItem('baytara_lang', 'en');
  window.scrollTo = vi.fn();
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/auth/me')) return json({
      user: { id: 7, name: 'Viewer', email: 'viewer@example.test', phone: '+201000000000', role: 'student' },
    });
    if (url.includes('/notifications')) return json({
      unread: 2,
      notifications: [
        { id: 11, type: 'info', title: 'Payment approved', body: 'Your receipt was accepted.', is_read: false, created_at: '2026-08-17T09:00:00+00:00' },
        { id: 12, type: 'info', title: 'Welcome', body: 'Start with the free videos.', is_read: false, created_at: '2026-08-16T09:00:00+00:00' },
      ],
    });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('marks a notification read when its row is clicked, and drops the badge', async () => {
  setToken('viewer-token');
  window.history.replaceState({}, '', '/');
  render(
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider><App /></AuthProvider>
      </I18nProvider>
    </BrowserRouter>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Notifications' }));
  const row = await screen.findByRole('button', { name: 'Payment approved — unread' });

  fireEvent.click(row);

  await waitFor(() => expect(
    fetch.mock.calls.some(([url, options]) => String(url) === '/api/v1/notifications/11/read' && options?.method === 'POST'),
  ).toBe(true));
  // The row loses its unread label and the badge counts down without a refetch.
  expect(await screen.findByRole('button', { name: 'Payment approved' })).toBeVisible();
  expect(screen.getByText('1')).toBeVisible();
});
