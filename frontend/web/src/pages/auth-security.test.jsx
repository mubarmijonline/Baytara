/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { auth, getDeviceId, setToken } from '../lib/api.js';
import { I18nProvider } from '../lib/i18n.jsx';

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
        <AuthProvider><App /></AuthProvider>
      </I18nProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_lang', 'en');
  window.scrollTo = vi.fn();
  vi.stubGlobal('fetch', vi.fn((input, options = {}) => {
    const url = String(input);
    if (url.includes('/settings')) return json({ settings: {} });
    if (url.includes('/auth/me')) return json({
      user: { id: 7, name: 'Viewer', email: 'viewer@example.test', phone: null, role: 'student' },
    });
    if (url.includes('/auth/profile') && options.method === 'PATCH') return json({
      user: { id: 7, name: 'Viewer', email: 'viewer@example.test', phone: '+201099999999', role: 'student' },
    });
    if (url.includes('/auth/devices')) return json({ devices: [], max_devices: 2 });
    if (url.includes('/enrollments')) return json({ enrollments: [] });
    if (url.includes('/courses')) return json({ courses: [] });
    if (url.includes('/videos/2')) return json({ video: null }, 404);
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('requires a phone number in public registration', async () => {
  renderRoute('/auth?next=/videos/2');
  fireEvent.click(await screen.findByRole('button', { name: 'حساب جديد' }));
  expect(screen.getByPlaceholderText('01xxxxxxxxx')).toBeRequired();
});

it('blocks a signup with a bad email or a number that is not a mobile', async () => {
  renderRoute('/auth');
  fireEvent.click(await screen.findByRole('button', { name: 'حساب جديد' }));
  const submit = screen.getByRole('button', { name: 'إنشاء حساب جديد' });

  fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'not-an-email' } });
  fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '01024527770' } });
  fireEvent.click(submit);
  expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');

  // A Cairo landline passes "required" but cannot carry the video watermark.
  fireEvent.change(screen.getByPlaceholderText('you@email.com'), { target: { value: 'vet@example.test' } });
  fireEvent.change(screen.getByPlaceholderText('01xxxxxxxxx'), { target: { value: '0221234567' } });
  fireEvent.click(submit);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/valid mobile number/i));

  // Neither attempt reached the API.
  expect(fetch.mock.calls.some(([url]) => String(url).includes('/auth/register'))).toBe(false);
});

it('sends the stable registered device on authenticated profile updates', async () => {
  setToken('viewer-token');
  const deviceId = getDeviceId();
  await auth.profile({ phone: '+201099999999' });

  expect(fetch).toHaveBeenCalledWith('/api/v1/auth/profile', expect.objectContaining({
    method: 'PATCH',
    headers: expect.objectContaining({
      Authorization: 'Bearer viewer-token',
      'X-Baytara-Device-ID': deviceId,
    }),
  }));
});

it('completes a missing phone profile and returns to the requested video', async () => {
  setToken('viewer-token');
  renderRoute('/dashboard/profile?next=/videos/2');

  const phone = await screen.findByRole('textbox', { name: 'Phone number' });
  fireEvent.change(phone, { target: { value: '+201099999999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save phone number' }));

  await waitFor(() => expect(window.location.pathname).toBe('/videos/2'));
  const profileCall = fetch.mock.calls.find(([url]) => String(url).includes('/auth/profile'));
  expect(JSON.parse(profileCall[1].body)).toEqual({ phone: '+201099999999' });
});
