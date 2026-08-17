/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
