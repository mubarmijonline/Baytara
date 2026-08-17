/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';

const settings = {
  hero: {
    title: 'Hero title', subtitle: 'Hero body', primary_cta: 'Browse paths',
    featured_label: 'Featured label', featured_title: 'Featured course',
    trust: [{ label: 'Rated 4.8' }, { label: 'Accredited' }],
  },
  home: { paths_title: 'Practice paths', paths_subtitle: 'From basics to a full case' },
  stats: [],
  testimonials: [],
  business: { stats: [] },
  footer: {},
};

const paths = [{
  id: 3, slug: 'herd-health', title: 'Herd health end to end',
  description: 'A structured diagnostic method.', level: 'intermediate',
  courses_count: 3, total_minutes: 840,
  steps: [
    { id: 11, slug: 'exam', title: 'Clinical examination', position: 0 },
    { id: 12, slug: 'control', title: 'Control programmes', position: 1 },
  ],
  start_slug: 'exam',
}];

const summary = {
  courses_enrolled: 12, watched_hours: 48, streak_days: 7,
  resume: {
    course: { id: 5, slug: 'repro', title: 'Reproduction' },
    lesson: { id: 42, title: 'Artificial insemination', poster: null },
    lesson_index: 6, total_lessons: 15, remaining_lessons: 9, percent: 40,
  },
};

function json(data) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

function mockApi({ summaryBody } = {}) {
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.includes('/learning-summary')) {
      return summaryBody ? json(summaryBody) : Promise.resolve(new Response('{}', { status: 401 }));
    }
    if (url.includes('/settings')) return json({ settings });
    if (url.includes('/paths')) return json({ paths });
    if (url.includes('/categories')) return json({ categories: [] });
    if (url.includes('/instructors')) return json({ instructors: [] });
    if (url.includes('/videos')) return json({ videos: [] });
    return json({});
  }));
}

function renderHome() {
  window.history.replaceState({}, '', '/');
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The paths section is hidden from the home page for now; PathCard and /paths remain.
it('shows the CMS trust chips and the hero photo when signed out', async () => {
  mockApi();
  renderHome();

  expect(await screen.findByText('Rated 4.8')).toBeVisible();
  // Nothing personal to resume, so the hero carries the brand photograph.
  const hero = document.querySelector('.home-hero-media img');
  expect(hero).toHaveAttribute('src', '/images/hero.webp');
  // No token, so the authed summary endpoint is never called.
  expect(fetch.mock.calls.filter(([url]) => String(url).includes('/learning-summary'))).toHaveLength(0);
});

it('shows the real resume point and learner counters when signed in', async () => {
  localStorage.setItem('baytara_token', 'test-token');
  mockApi({ summaryBody: summary });
  renderHome();

  expect(await screen.findByText('Artificial insemination')).toBeVisible();
  expect(screen.getByText(/Lesson 6 of 15/)).toBeVisible();
  expect(screen.getByText(/9 lessons left/)).toBeVisible();
  expect(screen.getByText('12')).toBeVisible();
  expect(screen.getByText('48')).toBeVisible();
  expect(screen.getByText('7')).toBeVisible();
  expect(screen.getByRole('link', { name: /Artificial insemination/ }))
    .toHaveAttribute('href', '/learn/repro/42');
});
