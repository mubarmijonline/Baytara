/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';
import { clearPublicCache } from '../lib/api.js';

const lessons = [
  { id: 11, title: 'Welcome', duration_minutes: 4, access_type: 'free', has_video: true },
  { id: 12, title: 'Core concepts', duration_minutes: 56, access_type: 'baytarian', has_video: true },
  { id: 13, title: 'Field case', duration_minutes: 60, access_type: 'baytarian', has_video: true },
];

const course = {
  id: 7, slug: 'cattle', title: 'Cattle disease basics',
  description: 'A structured diagnostic method.',
  price: 299, currency: 'EGP', is_paid: true, access_type: 'baytarian', lock_reason: null,
  access_days: null, status: 'published', enrolled_count: 18400,
  lessons_count: 3, video_minutes: 120, duration_minutes: 120,
  level: 'intermediate', has_certificate: true,
  objectives: ['Build a diagnostic method', 'Apply it to real cases'],
  rating: 4.9, reviews_count: 842,
  content_updated_at: '2026-06-14T10:00:00+00:00',
  category: { id: 1, name: 'Large animals', slug: 'large-animals' },
  instructor: { id: 3, name: 'Dr Ahmed', headline: 'Cattle consultant', avatar_url: null },
  videos: lessons,
  modules: [
    { id: null, title: null, lessons_count: 1, total_minutes: 4, videos: [lessons[0]] },
    { id: 4, title: 'Unit one', lessons_count: 2, total_minutes: 116, videos: [lessons[1], lessons[2]] },
  ],
};

const instructor = {
  instructor: {
    id: 3, name: 'Dr Ahmed', headline: 'Cattle consultant',
    courses: 12, students: 84000, expertise: ['Herd health'],
  },
  courses: [],
};

function json(data) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  }));
}

function mockApi({ courseBody = course, reviewBody } = {}) {
  const body = reviewBody || {
    reviews: [{
      id: 1, rating: 5, body: 'Excellent and practical.',
      created_at: '2026-06-01T00:00:00+00:00', author: { name: 'Dr Khaled', avatar_url: null },
    }],
    total: 1, rating: 4.9, reviews_count: 842,
  };
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.includes('/reviews')) return json(body);
    if (url.includes('/courses/cattle')) return json({ course: courseBody });
    if (url.includes('/instructors/3')) return json(instructor);
    if (url.includes('/courses')) return json({ courses: [], total: 0, pages: 1 });
    if (url.includes('/settings')) return json({ settings: {} });
    return json({});
  }));
}

function renderCourse() {
  window.history.replaceState({}, '', '/courses/cattle');
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders the course from the API rather than a mock course', async () => {
  mockApi();
  renderCourse();

  expect(await screen.findByRole('heading', { name: 'Cattle disease basics', level: 1 })).toBeVisible();
  expect(screen.getByText('Intermediate')).toBeVisible();
  expect(screen.getByText(/Updated/)).toBeVisible();
  // real objectives, not six identical mock bullets on every course
  expect(screen.getByText('Build a diagnostic method')).toBeVisible();
  expect(screen.getByText('299 EGP')).toBeVisible();
});

it('derives the includes rows from the access window and the certificate flag', async () => {
  mockApi();
  renderCourse();

  expect(await screen.findAllByText('Lifetime access')).toHaveLength(2);
  expect(screen.getByText('Accredited certificate')).toBeVisible();
  expect(screen.getByText('3 lessons · 2 hours of content')).toBeVisible();
});

it('groups the curriculum into units and marks the free preview', async () => {
  mockApi();
  renderCourse();

  // Found by text rather than by role-with-a-name-regex. The role query recomputes an
  // accessible name for every button on a fully rendered page, on each of its 50ms
  // retries, which on a loaded machine is what made this the one test in the file that
  // timed out. `closest('button')` keeps the part that actually matters: the unit is a
  // clickable accordion header, not a plain heading.
  const unit = await screen.findByText(/Unit one/);
  expect(unit).toBeVisible();
  expect(unit.closest('button')).not.toBeNull();
  expect(screen.getByText('2 units')).toBeVisible();
  expect(screen.getAllByText('Free preview').length).toBeGreaterThan(0);
});

it('shows the rating tile and reviews when the course has them', async () => {
  mockApi();
  renderCourse();

  // the hero tile and the reviews-block badge both carry it
  expect(await screen.findAllByText('★ 4.9')).toHaveLength(2);
  expect(screen.getByText('Excellent and practical.')).toBeVisible();
});

it('hides the rating tile and the reviews block on an unrated course', async () => {
  mockApi({
    courseBody: { ...course, rating: null, reviews_count: 0 },
    reviewBody: { reviews: [], total: 0, rating: null, reviews_count: 0 },
  });
  renderCourse();

  expect(await screen.findByRole('heading', { name: 'Cattle disease basics', level: 1 })).toBeVisible();
  expect(screen.queryAllByText('★ 4.9')).toHaveLength(0);
  expect(screen.queryByRole('heading', { name: 'Learner reviews' })).not.toBeInTheDocument();
});
