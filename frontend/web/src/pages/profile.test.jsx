/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';

const user = {
  id: 5, name: 'Dr Mohamed', email: 'm@example.test', phone: '+201000000000',
  role: 'student', locale: 'ar', is_baytarian: true,
  headline: 'Cattle disease', bio: 'Nine years in practice.', location: 'Cairo',
  avatar_url: '/api/v1/uploads/u5_avatar_abc.png', cover_url: null,
  created_at: '2025-03-04T00:00:00+00:00',
};

const certificates = [{
  serial: 'BT-ABC1234567', issued_at: '2026-08-10T00:00:00+00:00',
  learner_name: 'Dr Mohamed', course: { id: 1, slug: 'herd', title: 'Herd health' },
}];

const devices = [
  { id: 1, device_id: 'this-one', label: 'Chrome · Windows', last_seen: '2026-08-15T00:00:00+00:00' },
  { id: 2, device_id: 'other', label: 'iPhone · Baytara app', last_seen: '2026-08-14T00:00:00+00:00' },
];

const activity = [
  { type: 'lesson_completed', at: '2026-08-15T09:00:00+00:00', title: 'Core concepts', context: 'Cattle basics', href: '/learn/cattle/12' },
  { type: 'certificate', at: '2026-08-10T00:00:00+00:00', title: 'Herd health', context: 'BT-ABC1234567', href: '/certificates/BT-ABC1234567' },
];

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

let patched;

function mockApi() {
  patched = [];
  vi.stubGlobal('fetch', vi.fn((input, init) => {
    const url = String(input);
    if (url.includes('/auth/profile/image')) {
      return json({ user: { ...user, cover_url: '/api/v1/uploads/u5_cover_x.png' } }, 201);
    }
    if (url.includes('/auth/profile')) {
      patched.push(JSON.parse(init.body));
      return json({ user: { ...user, ...JSON.parse(init.body) } });
    }
    if (url.includes('/auth/me')) return json({ user });
    if (url.includes('/certificates')) return json({ certificates });
    if (url.includes('/activity')) return json({ activity });
    if (url.includes('/enrollments')) {
      return json({ enrollments: [
        { id: 1, progress: { completed_lessons: 12 } },
        { id: 2, progress: { completed_lessons: 25 } },
      ] });
    }
    if (url.includes('/auth/devices/')) return json({ deleted: 1 });
    if (url.includes('/auth/devices')) return json({ devices });
    if (url.includes('/baytarian/me')) return json({ is_baytarian: true });
    if (url.includes('/settings')) return json({ settings: {} });
    return json({});
  }));
}

function renderProfile(path = '/dashboard/profile') {
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
  localStorage.setItem('baytara_token', 'viewer-token');
  localStorage.setItem('baytara_device_id', 'this-one');
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows the real identity, verification and derived stats', async () => {
  mockApi();
  renderProfile();

  expect(await screen.findByRole('heading', { name: 'Dr Mohamed', level: 1 })).toBeVisible();
  expect(screen.getByText(/Verified veterinarian/)).toBeVisible();
  expect(screen.getByText('Cattle disease')).toBeVisible();
  expect(screen.getByText('Cairo')).toBeVisible();
  expect(screen.getByText(/Member since/)).toBeVisible();
  // 12 + 25 completed lessons across two enrollments
  expect(screen.getByText('37')).toBeVisible();
  expect(screen.getByText('2 courses')).toBeVisible();
});

it('saves the editable fields and never sends email or role', async () => {
  mockApi();
  renderProfile();

  // The account form is behind the settings tab now.
  fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
  const name = await screen.findByRole('textbox', { name: 'Name' });
  fireEvent.change(name, { target: { value: 'Dr M. Rashidi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

  await waitFor(() => expect(patched.length).toBe(1));
  expect(patched[0].name).toBe('Dr M. Rashidi');
  expect(patched[0]).not.toHaveProperty('email');
  expect(patched[0]).not.toHaveProperty('role');
  expect(await screen.findByText('Changes saved.')).toBeVisible();
});

it('keeps the phone gate when arriving with a next target', async () => {
  mockApi();
  renderProfile('/dashboard/profile?next=/videos/2');

  const phone = await screen.findByRole('textbox', { name: 'Phone number' });
  fireEvent.change(phone, { target: { value: '+201099999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save phone number' }));

  await waitFor(() => expect(window.location.pathname).toBe('/videos/2'));
  expect(patched[0]).toEqual({ phone: '+201099999999' });
});

it('lists certificates and links each to its public verification page', async () => {
  mockApi();
  renderProfile();

  fireEvent.click(await screen.findByRole('button', { name: 'Certificates' }));
  expect(await screen.findByText('Herd health')).toBeVisible();
  expect(screen.getByText('BT-ABC1234567')).toBeVisible();
  expect(screen.getByRole('link', { name: 'View certificate' }))
    .toHaveAttribute('href', '/certificates/BT-ABC1234567');
});

it('renders the derived activity feed', async () => {
  mockApi();
  renderProfile();

  expect(await screen.findByText('Completed the lesson “Core concepts”')).toBeVisible();
  expect(screen.getByText('Earned a certificate: Herd health')).toBeVisible();
});

it('lists devices and removes one', async () => {
  mockApi();
  renderProfile();

  fireEvent.click(await screen.findByRole('button', { name: 'Devices' }));
  expect(await screen.findByText('This device')).toBeVisible();
  // the label shows as both the row title and its detail line
  expect(screen.getAllByText(/iPhone/).length).toBeGreaterThan(0);

  fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
  await waitFor(() => expect(
    fetch.mock.calls.some(([url, init]) => String(url).includes('/auth/devices/1') && init?.method === 'DELETE'),
  ).toBe(true));
});

it('falls back to the overview for an unknown tab', async () => {
  mockApi();
  renderProfile('/dashboard/profile?tab=nonsense');

  // overview content, not an empty pane
  expect(await screen.findByText('37')).toBeVisible();
});

it('refuses to send the phone gate off-site', async () => {
  mockApi();
  renderProfile('/dashboard/profile?next=//evil.com');

  const phone = await screen.findByRole('textbox', { name: 'Phone number' });
  fireEvent.change(phone, { target: { value: '+201099999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save phone number' }));

  // Landing on /dashboard is the proof: a protocol-relative target would have left the origin.
  await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
});
