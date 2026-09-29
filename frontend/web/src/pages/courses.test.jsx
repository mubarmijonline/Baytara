/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';
import { SiteSettingsProvider } from '../lib/site-settings.jsx';
import { clearPublicCache } from '../lib/api.js';

const category = { id: 1, name: 'Poultry', slug: 'poultry', video_count: 4 };

const course = {
  id: 7,
  title: 'Poultry disease control',
  slug: 'poultry-disease-control',
  description: 'd',
  price: 349,
  currency: 'EGP',
  lessons_count: 26,
  video_minutes: 420,
  access_type: 'baytarian',
  is_paid: true,
  level: 'intermediate',
  rating: 4.9,
  enrolled_count: 21300,
  category,
  instructor: { id: 3, name: 'Dr Layla Hassan', headline: 'Poultry consultant' },
};

const facets = {
  level: { beginner: 3, intermediate: 1, advanced: 2, breeders: 0 },
  access_type: { free: 1, vet_free: 0, baytarian: 4, general: 1 },
};

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
        <SiteSettingsProvider>
          <AuthProvider><App /></AuthProvider>
        </SiteSettingsProvider>
      </I18nProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  clearPublicCache();   // module-level, and vitest isolates per file not per test
  localStorage.clear();
  localStorage.setItem('baytara_lang', 'en');
  window.scrollTo = vi.fn();
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.includes('/settings')) {
      return json({ settings: { courses: { title: 'What do you want to learn?', bar_cta: 'Learning bundles' } } });
    }
    if (url.includes('/categories')) return json({ categories: [category] });
    if (url.includes('/bundles')) return json({ bundles: [{ id: 1 }, { id: 2 }] });
    if (url.includes('/videos')) return json({ videos: [], total: 96, page: 1, pages: 1 });
    if (url.includes('/courses')) {
      return json({ courses: [course], total: 6, page: 1, pages: 1, per_page: 12, facets });
    }
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders the catalogue from the API and the CMS, with real counts only', async () => {
  renderRoute('/courses');

  expect(await screen.findByRole('heading', { name: 'What do you want to learn?' })).toBeVisible();
  // Hero line and tab counts are database totals, not copy.
  expect(screen.getByText(/6 courses across 1 specialties/)).toBeVisible();
  expect(screen.getByRole('link', { name: /Videos 96/ })).toHaveAttribute('href', '/videos');
  expect(screen.getByRole('link', { name: /Bundles 2/ })).toHaveAttribute('href', '/bundles');

  expect(screen.getByRole('heading', { name: 'Poultry disease control' })).toBeVisible();
  expect(screen.getByText('Dr Layla Hassan · Poultry consultant')).toBeVisible();
  expect(screen.getByText('★ 4.9')).toBeVisible();
  expect(screen.getByText('26 lessons')).toBeVisible();
  expect(screen.getByText('7 hours')).toBeVisible();
  expect(screen.getByText('21K learners')).toBeVisible();
  expect(screen.getByText('349 EGP')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Learning bundles' })).toHaveAttribute('href', '/bundles');

  // Facet counts come from the response; nothing is invented for the length or
  // rating groups, which the API does not count.
  expect(screen.getByRole('button', { name: /Intermediate 1/ })).toBeVisible();
  expect(screen.getByRole('button', { name: /Verified vets 4/ })).toBeVisible();
});

it('sends every sidebar filter and the sort choice to the API', async () => {
  renderRoute('/courses');

  fireEvent.click(await screen.findByRole('button', { name: /Advanced 2/ }));
  fireEvent.click(screen.getByRole('button', { name: /Under 3 hours/ }));
  fireEvent.change(screen.getByLabelText(/^Sort:/), { target: { value: 'rating' } });

  await waitFor(() => {
    // The last catalogue request carries every choice; earlier ones only have the
    // filters that had been picked at the time.
    const call = fetch.mock.calls
      .map(([url]) => String(url))
      .filter((url) => url.includes('/courses?'))
      .at(-1);
    expect(call).toContain('level=advanced');
    expect(call).toContain('duration=short');
    expect(call).toContain('sort=rating');
  });
});

it('filters by category through the rail and reflects it in the URL', async () => {
  renderRoute('/courses');

  fireEvent.click(await screen.findByRole('button', { name: 'Poultry' }));
  expect(new URLSearchParams(window.location.search).get('category')).toBe('poultry');

  await waitFor(() => {
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/courses?') && String(url).includes('category=poultry'))).toBe(true);
  });
});
