/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { LanguageProvider } from '../src/i18n.jsx';
import { api, setToken } from '../src/api.js';
import { Modal } from '../src/ui.jsx';

function makeStats(paymentPending = 0, baytarianPending = 0) {
  return {
    payments: { pending: paymentPending },
    baytarian: { pending: baytarianPending },
    courses: { published: 0, total: 0 },
    enrollments: 0,
    users: { students: 0, instructors: 0, total: 0 },
  };
}

const NAV_DESTINATIONS = [
  { path: '/admin/dashboard', link: /لوحة القيادة|dashboard/i, heading: /لوحة القيادة|dashboard/i },
  { path: '/admin/payments', link: /المعاملات|payments/i, heading: /المعاملات|payments/i },
  { path: '/admin/baytarian', link: /توثيق الأطباء|veterinarian verification/i, heading: /توثيق الأطباء|veterinarian verification/i },
  { path: '/admin/courses', link: /الدورات|courses/i, heading: /الدورات|courses/i },
  { path: '/admin/videos', link: /الفيديوهات|videos/i, heading: /الفيديوهات|videos/i },
  { path: '/admin/video-reports', link: /مراقبة الفيديو|video monitoring/i, heading: /مراقبة الفيديو|video monitoring/i },
  { path: '/admin/bundles', link: /الحزم|bundles/i, heading: /الحزم|bundles/i },
  { path: '/admin/hierarchy', link: /الهيكلة|hierarchy/i, heading: /الهيكلة|hierarchy/i },
  { path: '/admin/categories', link: /الفئات|categories/i, heading: /الفئات|categories/i },
  { path: '/admin/articles', link: /المحتوى والمدونة|content and articles/i, heading: /المحتوى|content/i },
  { path: '/admin/users', link: /المستخدمون|users/i, heading: /المستخدمون|users/i },
  { path: '/admin/messages', link: /الرسائل|messages/i, heading: /الرسائل|messages/i },
  { path: '/admin/settings', link: /إعدادات الموقع|site settings/i, heading: /إعدادات الموقع|site settings/i },
];

let currentStats;
let statsFetches;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function json(data, status = 200) {
  return Promise.resolve(jsonResponse(data, status));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function navigateHistory(action) {
  await act(async () => {
    const changed = new Promise((resolve) => {
      window.addEventListener('popstate', resolve, { once: true });
    });
    action();
    await changed;
  });
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
  currentStats = makeStats();
  statsFetches = 0;
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.endsWith('/auth/login')) {
      return json({ access_token: 'fresh-token', user: { role: 'admin' } });
    }
    if (url.endsWith('/admin/stats')) {
      statsFetches += 1;
      return json(currentStats);
    }
    if (url.includes('/admin/payments')) return json({ payments: [], paid_count: 0, revenue: 0 });
    if (url.includes('/admin/baytarian-requests')) return json({ requests: [] });
    if (url.includes('/admin/videos')) return json({ videos: [] });
    if (url.includes('/admin/video-reports/summary')) return json({ attempts: 0, successful: 0, active: 0, unique_viewers: 0, watch_seconds: 0, completion_rate: 0, denied: 0, failures: 0 });
    if (url.includes('/admin/video-reports/sessions')) return json({ sessions: [], total: 0, page: 1, per_page: 25, pages: 0 });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/admin/users')) return json({ users: [] });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/bundles')) return json({ bundles: [] });
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

  it.each(NAV_DESTINATIONS)('routes the $path sidebar destination to a stable pathname', async ({ path, link, heading }) => {
    renderAdmin('/admin/dashboard');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: /لوحة القيادة|dashboard/i });
    await user.click(screen.getByRole('link', { name: link }));

    await waitFor(() => expect(window.location.pathname).toBe(path));
    expect(await screen.findByRole('heading', { name: heading })).toBeVisible();
  });

  it('restores routed sections with browser Back and Forward', async () => {
    renderAdmin('/admin/dashboard');
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: /لوحة القيادة|dashboard/i });
    await user.click(screen.getByRole('link', { name: /الفيديوهات|videos/i }));
    await waitFor(() => expect(window.location.pathname).toBe('/admin/videos'));
    await user.click(screen.getByRole('link', { name: /إعدادات الموقع|site settings/i }));
    await waitFor(() => expect(window.location.pathname).toBe('/admin/settings'));

    await navigateHistory(() => window.history.back());
    await waitFor(() => expect(window.location.pathname).toBe('/admin/videos'));
    expect(await screen.findByRole('heading', { name: /الفيديوهات|videos/i })).toBeVisible();

    await navigateHistory(() => window.history.forward());
    await waitFor(() => expect(window.location.pathname).toBe('/admin/settings'));
    expect(await screen.findByRole('heading', { name: /إعدادات الموقع|site settings/i })).toBeVisible();
  });

  it('renders an Admin-scoped not-found page for unknown paths', async () => {
    renderAdmin('/admin/missing-section');

    expect(await screen.findByRole('heading', { name: /الصفحة غير موجودة|page not found/i })).toBeVisible();
    expect(window.location.pathname).toBe('/admin/missing-section');
  });
});

describe('Admin stats invalidation', () => {
  it('keeps the newest stats when an older request resolves last', async () => {
    const older = deferred();
    const newer = deferred();
    const statsSpy = vi.spyOn(api, 'stats')
      .mockImplementationOnce(() => older.promise)
      .mockImplementationOnce(() => newer.promise);
    renderAdmin('/admin/videos');

    await waitFor(() => expect(statsSpy).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event('baytara:admin-stats-changed')));
    await waitFor(() => expect(statsSpy).toHaveBeenCalledTimes(2));

    await act(async () => {
      newer.resolve(makeStats(8, 9));
      await newer.promise;
    });
    expect(within(screen.getByRole('link', { name: /المعاملات|payments/i })).getByText('8')).toBeVisible();
    expect(within(screen.getByRole('link', { name: /توثيق الأطباء|veterinarian verification/i })).getByText('9')).toBeVisible();

    await act(async () => {
      older.resolve(makeStats(1, 2));
      await older.promise;
    });
    expect(within(screen.getByRole('link', { name: /المعاملات|payments/i })).getByText('8')).toBeVisible();
    expect(within(screen.getByRole('link', { name: /توثيق الأطباء|veterinarian verification/i })).getByText('9')).toBeVisible();
  });

  it('keeps the token and mounted Shell when an older real stats response is unauthorized', async () => {
    const older = deferred();
    const newer = deferred();
    const defaultFetch = fetch.getMockImplementation();
    const statsResponses = [older, newer];
    fetch.mockImplementation((input, options) => {
      if (String(input).endsWith('/admin/stats')) {
        statsFetches += 1;
        return statsResponses.shift().promise;
      }
      return defaultFetch(input, options);
    });
    renderAdmin('/admin/videos');

    await waitFor(() => expect(statsFetches).toBe(1));
    act(() => window.dispatchEvent(new Event('baytara:admin-stats-changed')));
    await waitFor(() => expect(statsFetches).toBe(2));
    await act(async () => {
      newer.resolve(jsonResponse(makeStats(3, 4)));
      await newer.promise;
    });
    expect(await within(screen.getByRole('link', { name: /المعاملات|payments/i })).findByText('3')).toBeVisible();
    expect(within(screen.getByRole('link', { name: /توثيق الأطباء|veterinarian verification/i })).getByText('4')).toBeVisible();

    await act(async () => {
      older.resolve(jsonResponse({ error: 'unauthorized' }, 401));
      await older.promise;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.getByRole('heading', { name: /الفيديوهات|videos/i })).toBeVisible();
    expect(localStorage.getItem('baytara_admin_token')).toBe('test-token');
    const statsCalls = fetch.mock.calls.filter(([input]) => String(input).endsWith('/admin/stats'));
    expect(statsCalls).toHaveLength(2);
    statsCalls.forEach(([, options]) => {
      expect(options).not.toHaveProperty('deferUnauthorized');
      expect(options).not.toHaveProperty('clearTokenOn401');
    });
  });

  it('clears the token and logs out when the latest stats response is unauthorized', async () => {
    const latest = deferred();
    const defaultFetch = fetch.getMockImplementation();
    fetch.mockImplementation((input, options) => {
      if (String(input).endsWith('/admin/stats')) {
        statsFetches += 1;
        return latest.promise;
      }
      return defaultFetch(input, options);
    });
    renderAdmin('/admin/videos');

    expect(await screen.findByRole('heading', { name: /الفيديوهات|videos/i })).toBeVisible();
    await waitFor(() => expect(statsFetches).toBe(1));
    await act(async () => {
      latest.resolve(jsonResponse({ error: 'unauthorized' }, 401));
      await latest.promise;
    });

    expect(await screen.findByRole('heading', { name: /تسجيل دخول الإدارة|admin sign in/i })).toBeVisible();
    expect(localStorage.getItem('baytara_admin_token')).toBeNull();
  });

  it('renders Dashboard from the Shell-owned stats request', async () => {
    const statsSpy = vi.spyOn(api, 'stats');
    renderAdmin('/admin/dashboard?view=summary');

    expect(await screen.findByRole('heading', { name: /لوحة القيادة|dashboard/i })).toBeVisible();
    expect(statsSpy).toHaveBeenCalledTimes(1);
    expect(statsSpy).toHaveBeenCalledWith({ deferUnauthorized: true });
    expect(localStorage.getItem('baytara_admin_token')).toBe('test-token');
    expect(window.location.pathname).toBe('/admin/dashboard');
    expect(window.location.search).toBe('?view=summary');
  });

  it('retains automatic token clearing for other unauthorized API requests', async () => {
    fetch.mockImplementationOnce(() => json({ error: 'unauthorized' }, 401));

    await expect(api.users()).rejects.toMatchObject({ status: 401 });

    expect(localStorage.getItem('baytara_admin_token')).toBeNull();
  });

  it('refreshes badges on the named event and removes the listener on unmount', async () => {
    currentStats = makeStats(2, 3);
    const view = renderAdmin('/admin/videos');

    expect(await within(screen.getByRole('link', { name: /المعاملات|payments/i })).findByText('2')).toBeVisible();
    expect(within(screen.getByRole('link', { name: /توثيق الأطباء|veterinarian verification/i })).getByText('3')).toBeVisible();

    currentStats = makeStats(4, 5);
    act(() => window.dispatchEvent(new Event('baytara:admin-stats-changed')));
    expect(await within(screen.getByRole('link', { name: /المعاملات|payments/i })).findByText('4')).toBeVisible();
    expect(within(screen.getByRole('link', { name: /توثيق الأطباء|veterinarian verification/i })).getByText('5')).toBeVisible();
    expect(window.location.pathname).toBe('/admin/videos');

    const callsBeforeUnmount = statsFetches;
    view.unmount();
    window.dispatchEvent(new Event('baytara:admin-stats-changed'));
    expect(statsFetches).toBe(callsBeforeUnmount);
  });

  it('refreshes stats when the pathname changes', async () => {
    currentStats = makeStats(1, 0);
    renderAdmin('/admin/videos');
    const user = userEvent.setup();

    expect(await within(screen.getByRole('link', { name: /المعاملات|payments/i })).findByText('1')).toBeVisible();
    const callsBeforeNavigation = statsFetches;
    currentStats = makeStats(6, 0);
    await user.click(screen.getByRole('link', { name: /الفئات|categories/i }));

    await waitFor(() => expect(statsFetches).toBeGreaterThan(callsBeforeNavigation));
    expect(await within(screen.getByRole('link', { name: /المعاملات|payments/i })).findByText('6')).toBeVisible();
  });

  it.each([
    ['approve', [1]],
    ['reject', [1, 'reason']],
    ['baytarianApprove', [1]],
    ['baytarianReject', [1, 'reason']],
  ])('%s dispatches stats invalidation only after a successful mutation', async (method, args) => {
    const listener = vi.fn();
    window.addEventListener('baytara:admin-stats-changed', listener);
    try {
      await api[method](...args);
      expect(listener).toHaveBeenCalledTimes(1);

      fetch.mockImplementationOnce(() => json({ error: 'mutation_failed' }, 500));
      await expect(api[method](...args)).rejects.toThrow('mutation_failed');
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('baytara:admin-stats-changed', listener);
    }
  });
});

describe('Admin data invalidation', () => {
  it('dispatches data invalidation only after successful admin mutations', async () => {
    const listener = vi.fn();
    const userMutationListener = (event) => {
      if (event.detail?.path === '/admin/users') listener(event);
    };
    window.addEventListener('baytara:admin-data-changed', userMutationListener);
    try {
      await api.userCreate({
        name: 'New User',
        email: 'new-user@example.test',
        password: 'secret123',
        role: 'student',
      });
      await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));

      fetch.mockImplementationOnce(() => json({ error: 'mutation_failed' }, 500));
      await expect(api.userCreate({
        name: 'Failed User',
        email: 'failed-user@example.test',
        password: 'secret123',
        role: 'student',
      })).rejects.toThrow('mutation_failed');
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('baytara:admin-data-changed', userMutationListener);
    }
  });

  it('reloads the active routed page when admin data changes', async () => {
    const defaultFetch = fetch.getMockImplementation();
    let usersFetches = 0;
    fetch.mockImplementation((input, options = {}) => {
      const url = String(input);
      const method = (options.method || 'GET').toUpperCase();
      if (url.includes('/admin/users') && method === 'GET') {
        usersFetches += 1;
        return json({ users: [] });
      }
      return defaultFetch(input, options);
    });

    renderAdmin('/admin/users');

    expect(await screen.findByRole('heading', { name: /المستخدمون|users/i })).toBeVisible();
    await waitFor(() => expect(usersFetches).toBe(1));

    act(() => window.dispatchEvent(new Event('baytara:admin-data-changed')));

    await waitFor(() => expect(usersFetches).toBe(2));
    expect(window.location.pathname).toBe('/admin/users');
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
    expect(screen.getByRole('button', { name: 'Arabic' })).toBeVisible();
  });
});

describe('shared modal', () => {
  it('normalizes every requested size to the shared XL dialog', () => {
    render(<Modal title="Dialog title" size="sm" onClose={() => {}}>Body</Modal>);

    expect(screen.getByRole('dialog', { name: 'Dialog title' })).toHaveClass('modal', 'modal-xl');
  });
});
