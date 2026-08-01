/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { setToken } from '../src/api.js';
import { LanguageProvider } from '../src/i18n.jsx';

function json(data) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function renderAdmin(path) {
  window.history.replaceState({}, '', path);
  return render(
    <BrowserRouter basename="/admin" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider><App /></LanguageProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_admin_language', 'en');
  setToken('english-admin-token');
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({
      payments: { pending: 0 }, courses: { published: 0, total: 0 },
      enrollments: 0, users: { students: 0, instructors: 0, total: 0 },
      baytarian: { pending: 0 },
    });
    if (url.includes('/admin/payments')) return json({ payments: [], paid_count: 0, revenue: 0 });
    if (url.includes('/admin/baytarian-requests')) return json({ requests: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/admin/users')) return json({ users: [] });
    if (url.includes('/admin/articles')) return json({ articles: [] });
    if (url.includes('/admin/messages')) return json({ messages: [], unread: 0 });
    if (url.includes('/admin/settings')) return json({ settings: {} });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  ['/admin/dashboard', 'Dashboard'],
  ['/admin/payments', 'Payments'],
  ['/admin/baytarian', 'Veterinarian verification'],
  ['/admin/hierarchy', 'Hierarchy'],
  ['/admin/articles', 'Content and articles'],
  ['/admin/users', 'Users'],
  ['/admin/messages', 'Messages'],
  ['/admin/settings', 'Site settings'],
])('renders English UI at %s', async (route, heading) => {
  renderAdmin(route);

  expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  expect(document.documentElement).toHaveAttribute('dir', 'ltr');
});

it('localizes article and user dialogs', async () => {
  const user = userEvent.setup();
  const view = renderAdmin('/admin/articles');
  await screen.findByRole('heading', { name: 'Content and articles' });
  await user.click(screen.getByRole('button', { name: 'New article' }));
  expect(screen.getByRole('dialog', { name: 'New article' })).toBeVisible();

  view.unmount();
  renderAdmin('/admin/users');
  await screen.findByRole('heading', { name: 'Users' });
  await user.click(screen.getByRole('button', { name: 'New user' }));
  expect(screen.getByRole('dialog', { name: 'New user' })).toBeVisible();
  expect(screen.getByLabelText('Role')).toBeVisible();
});

it('localizes veterinarian statuses and actions', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({
      payments: { pending: 0 }, courses: { published: 0, total: 0 },
      enrollments: 0, users: { students: 0, instructors: 0, total: 0 },
      baytarian: { pending: 1 },
    });
    if (url.includes('/admin/baytarian-requests')) return json({ requests: [{
      id: 1, status: 'pending', user: { name: 'Doctor', email: 'doctor@example.test' },
      note: '', documents_count: 1, created_at: '2026-08-01T10:00:00',
    }] });
    return json({});
  });

  renderAdmin('/admin/baytarian');

  expect(await screen.findByText('Pending review')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Document 1' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Verify' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Reject' })).toBeVisible();
});
