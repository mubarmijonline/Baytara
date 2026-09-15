/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';
import { clearPublicCache } from '../lib/api.js';

const settings = {
  header: { welcome: 'Configured welcome', app_label: 'Configured app', help_label: 'Configured help' },
  hero: { title: 'Configured hero', subtitle: 'Configured hero body', primary_cta: 'Configured primary' },
  home: { testimonials_title: 'Configured testimonials' },
  stats: [{ num: '321', label: 'Configured metric' }],
  testimonials: [{ name: 'Configured learner', role: 'Configured role', quote: 'Configured quote' }],
  about: { title: 'Configured about', body: 'Configured about body', values: [{ title: 'Configured value', description: 'Configured value body' }] },
  business: {
    eyebrow: 'Configured business eyebrow', title: 'Configured business', body: 'Configured business body',
    primary_cta: 'Configured demo action', secondary_cta: 'Configured talk action',
    stats: [], features: [{ icon: '+', title: 'Configured feature', description: 'Configured feature body' }],
    logos: [{ name: 'Configured customer', url: '/configured-logo.png' }],
  },
  contact: { title: 'Configured contact', subtitle: 'Configured contact body', email: 'configured@baytara.app' },
  footer: { tagline: 'Configured footer', copyright: 'Configured copyright' },
  socials: { youtube: 'https://youtube.example/baytara' },
};

function json(data) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: 200,
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
  clearPublicCache();   // module-level, and vitest isolates per file not per test
  localStorage.clear();
  window.scrollTo = vi.fn();
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings });
    if (url.includes('/courses')) return json({ courses: [] });
    if (url.includes('/categories')) return json({ categories: [] });
    if (url.includes('/instructors')) return json({ instructors: [] });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders configured Header, Home, and Footer content from one settings request', async () => {
  renderRoute('/');

  expect(await screen.findByText('Configured welcome')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Configured hero' })).toBeVisible();
  expect(screen.getByText('Configured metric')).toBeVisible();
  expect(screen.getByText('Configured testimonials')).toBeVisible();
  expect(screen.getByText('Configured footer')).toBeVisible();
  expect(screen.getByText('Configured copyright')).toBeVisible();
  expect(fetch.mock.calls.filter(([url]) => String(url).includes('/settings'))).toHaveLength(1);
});

it.each([
  ['/about', 'Configured about', 'Configured about body'],
  ['/business', 'Configured business', 'Configured business body'],
  ['/contact', 'Configured contact', 'Configured contact body'],
])('renders configured content at %s', async (path, title, body) => {
  renderRoute(path);

  expect(await screen.findByRole('heading', { name: title })).toBeVisible();
  expect(screen.getByText(body)).toBeVisible();
});

it('renders every editable Business hero and feature field', async () => {
  renderRoute('/business');

  expect(await screen.findByText('Configured business eyebrow')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Configured demo action' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Configured talk action' })).toBeVisible();
  expect(screen.getByText('Configured feature')).toBeVisible();
  expect(screen.getByText('Configured feature body')).toBeVisible();
  expect(screen.getByRole('img', { name: 'Configured customer' })).toHaveAttribute('src', '/configured-logo.png');
});

it('reaches the privacy policy from the footer, with the configured support email', async () => {
  // Google's OAuth branding form rejects a privacy URL that does not resolve on
  // the authorized domain, so this route has to keep working.
  renderRoute('/');

  fireEvent.click(await screen.findByText('سياسة الخصوصية'));

  expect(window.location.pathname).toBe('/privacy');
  expect(await screen.findByRole('heading', { name: 'سياسة الخصوصية' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'configured@baytara.app' }))
    .toHaveAttribute('href', 'mailto:configured@baytara.app');
});

it('reaches the refund policy from the footer, and publishes no placeholder WhatsApp', async () => {
  // The payment gateway's reviewers check the footer for this link first.
  renderRoute('/');

  fireEvent.click(await screen.findByText('سياسة الاسترجاع'));

  expect(window.location.pathname).toBe('/refund');
  expect(await screen.findByRole('heading', { name: 'سياسة الاسترجاع والإلغاء' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'support@baytara.app' }))
    .toHaveAttribute('href', 'mailto:support@baytara.app');
  // No WhatsApp number is configured in these settings, so the clause must not render.
  expect(screen.queryByText(/واتساب/)).toBeNull();
});

it('renders configured About values and Footer social links', async () => {
  const view = renderRoute('/about');

  expect(await screen.findByText('Configured value')).toBeVisible();
  expect(screen.getByText('Configured value body')).toBeVisible();
  expect(screen.getByRole('link', { name: 'youtube' })).toHaveAttribute('href', 'https://youtube.example/baytara');
  view.unmount();
});
