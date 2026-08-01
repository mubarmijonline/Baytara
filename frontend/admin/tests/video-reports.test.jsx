/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { setToken } from '../src/api.js';
import { LanguageProvider } from '../src/i18n.jsx';

const session = {
  session_id: '11111111-1111-4111-8111-111111111111',
  viewer: { id: 2, name: 'Viewer One', email: 'viewer@example.test', phone: '+201000000000' },
  video: { id: 8, title: 'Introduction' },
  category: 'large-animals',
  course: { id: 4, title: 'Cattle Course' },
  access_type: 'free',
  security: { device_id: 'browser-one', ip_address: '203.0.113.10', user_agent: 'Firefox Test Browser' },
  status: 'playing',
  reason: null,
  watched_seconds: 32,
  covered_seconds: 30,
  duration_seconds: 60,
  completion_percent: 50,
  started_at: '2026-08-01T16:59:40+00:00',
  first_played_at: '2026-08-01T16:59:45+00:00',
  last_event_at: '2026-08-01T16:59:55+00:00',
  ended_at: null,
  events: [
    { id: 1, type: 'otp_issued', created_at: '2026-08-01T16:59:40+00:00', position_seconds: null, watched_seconds: null },
    { id: 2, type: 'play', created_at: '2026-08-01T16:59:45+00:00', position_seconds: 0, watched_seconds: 0 },
  ],
};

function json(data, status = 200, contentType = 'application/json') {
  return Promise.resolve(new Response(contentType === 'application/json' ? JSON.stringify(data) : data, {
    status,
    headers: { 'Content-Type': contentType },
  }));
}

function renderAdmin(path) {
  window.history.replaceState({}, '', path);
  return render(
    <BrowserRouter basename="/admin" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider><App /></LanguageProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_admin_language', 'en');
  setToken('report-admin-token');
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: { pending: 0 }, baytarian: { pending: 0 } });
    if (url.includes('/video-reports/summary')) return json({
      attempts: 4, successful: 2, active: 1, unique_viewers: 2,
      watch_seconds: 90, completion_rate: 50, denied: 1, failures: 1,
    });
    if (url.includes('/video-reports/sessions/')) return json({ session });
    if (url.includes('/video-reports/sessions')) return json({ sessions: [{ ...session, events: undefined }], total: 1, page: 1, per_page: 25, pages: 1 });
    if (url.includes('/video-reports/export.csv')) return json('session_reference\n111\n', 200, 'text/csv');
    return json({});
  }));
  window.URL.createObjectURL = vi.fn(() => 'blob:report');
  window.URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('renders the report list and stores changed filters in the stable URL', async () => {
  renderAdmin('/admin/video-reports?status=playing&page=2');
  const user = userEvent.setup();

  expect(await screen.findByRole('heading', { name: 'Video monitoring' })).toBeVisible();
  expect(screen.getByText('4')).toBeVisible();
  expect(screen.getByText('Introduction')).toBeVisible();
  expect(screen.getByText('Viewer One')).toBeVisible();
  expect(screen.getByLabelText('Status')).toHaveValue('playing');
  expect(screen.getByLabelText('Viewer')).toHaveValue('');

  await user.selectOptions(screen.getByLabelText('Status'), 'denied');
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('status')).toBe('denied'));
  expect(new URLSearchParams(window.location.search).get('page')).toBe('1');

  fireEvent.change(screen.getByLabelText('Viewer'), { target: { value: 'viewer@example.test' } });
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('viewer')).toBe('viewer@example.test'));
});

it('opens a dedicated session page with identity, security facts, and ordered events', async () => {
  renderAdmin(`/admin/video-reports/${session.session_id}`);

  expect(await screen.findByRole('heading', { name: 'Playback session' })).toBeVisible();
  expect(screen.getByText('viewer@example.test')).toBeVisible();
  expect(screen.getByText('+201000000000')).toBeVisible();
  expect(screen.getByText('browser-one')).toBeVisible();
  expect(screen.getByText('203.0.113.10')).toBeVisible();
  const events = screen.getAllByTestId('playback-event');
  expect(events[0]).toHaveTextContent('OTP issued');
  expect(events[1]).toHaveTextContent('Play');
  expect(screen.getByRole('link', { name: 'Back to reports' })).toHaveAttribute('href', '/admin/video-reports');
});

it('downloads the filtered CSV with authorization outside the query string', async () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  renderAdmin('/admin/video-reports?category=large-animals&status=denied');
  const user = userEvent.setup();

  await user.click(await screen.findByRole('button', { name: 'Export CSV' }));
  await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
  const [url, options] = fetch.mock.calls.find(([input]) => String(input).includes('/video-reports/export.csv'));
  expect(String(url)).toContain('category=large-animals');
  expect(String(url)).toContain('status=denied');
  expect(String(url)).not.toContain('token');
  expect(options.headers.Authorization).toBe('Bearer report-admin-token');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:report');
});

it('renders the complete report page in Arabic', async () => {
  localStorage.setItem('baytara_admin_language', 'ar');
  renderAdmin('/admin/video-reports');

  expect(await screen.findByRole('heading', { name: 'مراقبة الفيديو' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'تصدير CSV' })).toBeVisible();
  expect(document.documentElement).toHaveAttribute('dir', 'rtl');
});
