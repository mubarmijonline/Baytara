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

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

// Held open so the page stays in its processing state while we assert on it.
let releaseDocument;

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
  clearPublicCache();   // module-level, and vitest isolates per file not per test
  localStorage.clear();
  localStorage.setItem('baytara_lang', 'en');
  window.scrollTo = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/auth/me')) return json({
      user: { id: 7, name: 'Viewer', email: 'viewer@example.test', phone: '+201000000000', role: 'student', is_baytarian: false },
    });
    if (url.includes('/baytarian/document')) {
      return new Promise((resolve) => { releaseDocument = () => resolve(json({ pending: true }, 202)); });
    }
    if (url.includes('/notifications')) return json({ notifications: [], unread: 0 });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows live processing while the document is read, then says a person will answer', async () => {
  setToken('viewer-token');
  renderRoute('/verify');

  // The student route takes any document and asks for no national ID.
  fireEvent.click(await screen.findByLabelText(/faculty card|Other document|college/i));
  const file = new File(['x'], 'card.png', { type: 'image/png' });
  const picker = document.querySelector('input[type="file"]');
  fireEvent.change(picker, { target: { files: [file] } });

  fireEvent.click(await screen.findByRole('button', { name: /verify my account|Verify/i }));

  // Mid-flight: the wait is explained rather than left to a disabled button.
  expect(await screen.findByText(/Verifying your account/i)).toBeVisible();
  expect(screen.getByText(/keep the page open/i)).toBeVisible();

  releaseDocument();

  // 202 means nobody could decide, so the answer arrives as a notification later.
  expect(await screen.findByText(/We have your document/i)).toBeVisible();
  expect(screen.getByText(/arrive in your notifications/i)).toBeVisible();
});

it('verifies from a document with no national ID typed, which is now optional', async () => {
  // The client, 2026-09-28: applicants from Jordan and Mauritania have no Egyptian number
  // to type. The photo upload used to stay greyed out until one was saved.
  setToken('viewer-token');
  renderRoute('/verify');

  fireEvent.click(await screen.findByLabelText(/National ID card/i));
  expect(screen.getByText(/National ID \(optional\)/i)).toBeVisible();
  expect(screen.getByText(/you can leave it empty/i)).toBeVisible();

  fireEvent.change(document.querySelector('input[type="file"]'),
    { target: { files: [new File(['x'], 'id.png', { type: 'image/png' })] } });
  const submit = await screen.findByRole('button', { name: /verify my account|Verify/i });
  expect(submit).toBeEnabled();
  fireEvent.click(submit);

  await waitFor(() => expect(fetch.mock.calls.some(([url]) => String(url).includes('/baytarian/document'))).toBe(true));
  // Nothing was sent to the profile first: no number was demanded.
  expect(fetch.mock.calls.some(([url, options]) => String(url).includes('/auth/me') && options?.method === 'PATCH')).toBe(false);
  releaseDocument();
  expect(await screen.findByText(/We have your document/i)).toBeVisible();
});
