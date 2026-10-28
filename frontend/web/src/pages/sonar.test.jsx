/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { I18nProvider } from '../lib/i18n.jsx';
import { clearPublicCache } from '../lib/api.js';

const student = { id: 5, name: 'Dr M', email: 'm@example.test', phone: '+201000000000', role: 'student' };

const exam = {
  id: 11, label: 'cow 45', species: 'bovine', measures: { crl: 9, bpd: 90 }, exam_date: '2026-10-01',
  result: {
    species: 'bovine', age_days: 140, months: 4, extra_days: 20, gestation_days: 283,
    days_remaining: 143, at_term: false, exam_date: '2026-10-01', expected_birth: '2027-02-21',
    range_days: [30, 250],
    per_measure: [
      { measure: 'crl', mm: 9, age_days: 30, beyond_term: false },
      { measure: 'bpd', mm: 90, age_days: 250, beyond_term: false },
    ],
  },
};

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
}

let posted;

function mockApi(user, history = []) {
  posted = [];
  vi.stubGlobal('fetch', vi.fn((input, init = {}) => {
    const url = String(input);
    if (url.includes('/tools/sonar') && init.method === 'POST') {
      posted.push(JSON.parse(init.body));
      return json({ exam }, 201);
    }
    if (url.includes('/tools/sonar')) return json({ exams: history, more: false });
    if (url.includes('/auth/me')) return user ? json({ user }) : json({ error: 'x' }, 401);
    if (url.includes('/settings')) return json({ settings: {} });
    return json({});
  }));
}

function renderAt(path) {
  window.history.replaceState({}, '', path);
  return render(<BrowserRouter><I18nProvider><AuthProvider><App /></AuthProvider></I18nProvider></BrowserRouter>);
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

it('shows a visitor the sign-up gate and no calculator', async () => {
  mockApi(null);
  renderAt('/tools/sonar');
  expect(await screen.findByText('The calculator is for Baytara members')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Create a free account' }))
    .toHaveAttribute('href', '/auth?mode=signup&next=/tools/sonar');
  expect(screen.queryByRole('button', { name: 'Calculate and save the case' })).toBeNull();
  // the formulas are never fetched or shipped to a visitor
  expect(fetch.mock.calls.some(([u]) => String(u).includes('/tools/sonar'))).toBe(false);
});

it('sends only the measurements entered, and shows the saved result', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi(student);
  renderAt('/tools/sonar');

  const button = await screen.findByRole('button', { name: 'Calculate and save the case' });
  // horses have no placentome field
  fireEvent.click(screen.getByRole('radio', { name: 'Horses' }));
  expect(screen.queryByLabelText('Placentomes (mm)')).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'Cattle' }));

  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter at least one measurement.');
  expect(posted).toEqual([]);

  fireEvent.change(screen.getByLabelText('Crown-rump length CRL (mm)'), { target: { value: '9' } });
  fireEvent.change(screen.getByLabelText('Biparietal diameter BPD (mm)'), { target: { value: '90' } });
  fireEvent.change(screen.getByLabelText('Case number / name (optional)'), { target: { value: 'cow 45' } });
  fireEvent.click(button);

  const scrolled = vi.fn();
  Element.prototype.scrollIntoView = scrolled;
  await waitFor(() => expect(posted).toHaveLength(1));
  expect(posted[0]).toMatchObject({ species: 'bovine', label: 'cow 45', measures: { crl: 9, bpd: 90 } });
  expect(await screen.findByText('Result')).toBeVisible();
  expect(screen.getAllByText(/140 days/)[0]).toBeVisible();
  expect(screen.getByText('Estimates range from 30 to 250 days')).toBeVisible();
  // the new result is brought into view rather than left above the fold on a phone
  await waitFor(() => expect(scrolled).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' })));
  delete Element.prototype.scrollIntoView;
});

it('lists the account history with copy and WhatsApp', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi(student, [exam]);
  renderAt('/tools/sonar');
  expect(await screen.findByText('cow 45')).toBeVisible();
  const share = screen.getByRole('link', { name: 'Send on WhatsApp' });
  expect(decodeURIComponent(share.getAttribute('href'))).toContain('• Case (cow 45) [Cattle] -> age: 140 days');
});

it('measures dogs and cats on their four fields only', async () => {
  localStorage.setItem('baytara_token', 'viewer-token');
  mockApi(student);
  renderAt('/tools/sonar');
  await screen.findByRole('button', { name: 'Calculate and save the case' });
  fireEvent.click(screen.getByRole('radio', { name: 'Cats' }));
  expect(screen.getByLabelText('Inner chorionic cavity ICC (mm)')).toBeVisible();
  expect(screen.getByLabelText('Body/abdominal diameter BD (mm)')).toBeVisible();
  for (const gone of ['Eye orbit (mm)', 'Head length HL (mm)', 'Placentomes (mm)']) {
    expect(screen.queryByLabelText(gone)).toBeNull();
  }
  expect(screen.getByText('Gestational sac')).toBeVisible();
  fireEvent.click(screen.getByRole('radio', { name: 'Cattle' }));
  expect(screen.getByLabelText('Eye orbit (mm)')).toBeVisible();
});
