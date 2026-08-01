/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { LanguageProvider } from '../src/i18n.jsx';
import { setToken } from '../src/api.js';
import { Modal } from '../src/ui.jsx';

const stats = {
  payments: { pending: 0 },
  baytarian: { pending: 0 },
  courses: { published: 0, total: 0 },
  enrollments: 0,
  users: { students: 0, instructors: 0, total: 0 },
};

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function renderAdmin(path) {
  window.history.replaceState({}, '', path);
  return render(
    <BrowserRouter basename="/admin" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setToken('test-token');
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.endsWith('/auth/login')) {
      return json({ access_token: 'fresh-token', user: { role: 'admin' } });
    }
    if (url.endsWith('/admin/stats')) return json(stats);
    if (url.includes('/admin/videos')) return json({ videos: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.unstubAllGlobals();
});

describe('Admin routing', () => {
  it('redirects the Admin root to the dashboard', async () => {
    renderAdmin('/admin/');

    expect(await screen.findByRole('heading', { name: /لوحة القيادة|dashboard/i })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/dashboard');
  });

  it('renders and preserves a deep-linked section with its query', async () => {
    renderAdmin('/admin/videos?view=grid');

    expect(await screen.findByRole('heading', { name: /الفيديوهات|videos/i })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/videos');
    expect(window.location.search).toBe('?view=grid');
  });

  it('keeps the requested deep link through login', async () => {
    setToken('');
    renderAdmin('/admin/videos?view=grid');
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/البريد الإلكتروني|email/i), 'admin@baytara.app');
    await user.type(screen.getByLabelText(/كلمة المرور|password/i), 'secret');
    await user.click(screen.getByRole('button', { name: /دخول|sign in/i }));

    expect(await screen.findByRole('heading', { name: /الفيديوهات|videos/i })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/videos');
    expect(window.location.search).toBe('?view=grid');
  });

  it('supports sidebar navigation and browser history', async () => {
    renderAdmin('/admin/dashboard');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: /لوحة القيادة|dashboard/i })).toBeVisible();
    await user.click(screen.getByRole('link', { name: /الفيديوهات|videos/i }));
    expect(await screen.findByRole('heading', { name: /الفيديوهات|videos/i })).toBeVisible();

    act(() => window.history.back());
    expect(await screen.findByRole('heading', { name: /لوحة القيادة|dashboard/i })).toBeVisible();
  });

  it('renders an Admin-scoped not-found page for unknown paths', async () => {
    renderAdmin('/admin/missing-section');

    expect(await screen.findByRole('heading', { name: /الصفحة غير موجودة|page not found/i })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/missing-section');
  });
});

describe('Admin language', () => {
  it('persists English and restores its document direction', async () => {
    const firstRender = renderAdmin('/admin/dashboard');
    const user = userEvent.setup();

    expect(document.documentElement).toHaveAttribute('lang', 'ar');
    expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(localStorage.getItem('baytara_admin_language')).toBe('en');
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeVisible();

    firstRender.unmount();
    renderAdmin('/admin/dashboard');
    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.documentElement).toHaveAttribute('dir', 'ltr');
    expect(screen.getByRole('button', { name: 'العربية' })).toBeVisible();
  });
});

describe('shared modal', () => {
  it('normalizes every requested size to the shared XL dialog', () => {
    render(<Modal title="Dialog title" size="sm" onClose={() => {}}>Body</Modal>);

    expect(screen.getByRole('dialog', { name: 'Dialog title' })).toHaveClass('modal', 'modal-xl');
  });
});
