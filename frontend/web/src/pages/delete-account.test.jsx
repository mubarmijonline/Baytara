/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';
import { clearPublicCache } from '../lib/api.js';

const student = {
  id: 5, name: 'Dr Mohamed', email: 'm@example.test', phone: '+201000000000',
  role: 'student', locale: 'en', has_password: true, created_at: '2025-03-04T00:00:00+00:00',
};

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

let deletions;

function mockApi(user, answer = () => json({ status: 'deleted' })) {
  deletions = [];
  vi.stubGlobal('fetch', vi.fn((input, init = {}) => {
    const url = String(input);
    if (url.includes('/auth/account') && init.method === 'DELETE') {
      deletions.push(JSON.parse(init.body));
      return answer();
    }
    if (url.includes('/auth/me')) return user ? json({ user }) : json({ error: 'x' }, 401);
    if (url.includes('/settings')) return json({ settings: {} });
    return json({});
  }));
}

function renderAt(path) {
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
  clearPublicCache();
  localStorage.clear();
  localStorage.setItem('baytara_lang', 'en');
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('asks a signed-out visitor to sign in and come back', async () => {
  mockApi(null);
  renderAt('/account/delete');
  // The site header has a sign-in link of its own; this page's one carries the way back.
  await waitFor(() => expect(screen.getAllByRole('link', { name: 'Sign in' })
    .some((link) => link.getAttribute('href') === '/auth?next=/account/delete')).toBe(true));
  expect(screen.getByText('What is deleted')).toBeVisible();
});

it('deletes only after the confirmation, sends the password, and signs out', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi(student);
  renderAt('/account/delete');

  const button = await screen.findByRole('button', { name: 'Delete my account permanently' });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret12' } });
  fireEvent.click(screen.getByRole('checkbox'));
  expect(button).toBeEnabled();
  fireEvent.click(button);

  expect(await screen.findByText('Your account has been deleted')).toBeVisible();
  expect(deletions).toEqual([{ confirm: true, password: 'secret12' }]);
  expect(localStorage.getItem('baytara_token')).toBeNull();
});

it('keeps the session and says so when the password is wrong', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi(student, () => json({ error: 'wrong_password' }, 403));
  renderAt('/account/delete');

  fireEvent.change(await screen.findByLabelText('Password'), { target: { value: 'nope' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Delete my account permanently' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('That password is not correct.');
  await waitFor(() => expect(localStorage.getItem('baytara_token')).toBe('viewer-token'));
});

it('asks a Google-only account for no password', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi({ ...student, has_password: false });
  renderAt('/account/delete');

  await screen.findByRole('button', { name: 'Delete my account permanently' });
  expect(screen.queryByLabelText('Password')).toBeNull();
});
