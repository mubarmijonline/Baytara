/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { setToken } from '../src/api.js';
import { LanguageProvider } from '../src/i18n.jsx';

vi.setConfig({ testTimeout: 15_000 });

const categories = [
  { id: 1, slug: 'large-animals', name: 'Large animals', name_en: 'Large animals' },
];

function response(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

function renderUpload() {
  window.history.replaceState({}, '', '/admin/videos/upload');
  return render(
    <BrowserRouter basename="/admin" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider><App /></LanguageProvider>
    </BrowserRouter>,
  );
}

const clip = (name) => new File([new Uint8Array(8)], name, { type: 'video/mp4' });

// The selects are populated by their own requests; setting a value before the options
// arrive is a no-op on a React select, which is a test trap, not app behaviour.
async function chooseCategory() {
  await screen.findByRole('option', { name: 'Large animals' });
  fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: '1' } });
}
async function chooseInstructor() {
  await screen.findByRole('option', { name: 'Dr Sara' });
  fireEvent.change(screen.getByLabelText(/Instructor/i), { target: { value: '8' } });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_admin_language', 'en');
  setToken('test-token');
  // XHR carries the file upload, so it is stubbed rather than fetch.
  vi.stubGlobal('XMLHttpRequest', class {
    open() {} setRequestHeader() {}
    upload = {};
    send() { this.status = 200; this.responseText = '{"video":{"local_status":"packaging"}}'; this.onload(); }
  });
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return response({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/categories')) return response({ categories });
    if (url.includes('/admin/users')) return response({ users: [{ id: 8, name: 'Dr Sara' }] });
    if (url.includes('/admin/videos/') ) return response({ video: { id: 41, local_status: 'packaging' } });
    if (url.includes('/admin/videos')) return response({ video: { id: 41 } }, 201);
    return response({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('will not upload without a category, and says which field is missing', async () => {
  renderUpload();
  // Picking the file is the whole gesture: there is no button to press afterwards.
  fireEvent.change(await screen.findByLabelText(/Video file/i), { target: { files: [clip('one.mp4')] } });

  await waitFor(() => {
    expect(document.querySelector('.error-text')?.textContent).toBe('Category is required.');
  });
  // Nothing was created: the catalogue row is only made once the form is valid.
  expect(fetch.mock.calls.some(([url, o]) => String(url).endsWith('/admin/videos') && o?.method === 'POST')).toBe(false);
});

it('names the missing instructor instead of printing a translation key', async () => {
  renderUpload();
  await chooseCategory();
  fireEvent.change(await screen.findByLabelText(/Video file/i), { target: { files: [clip('one.mp4')] } });

  await waitFor(() => {
    expect(document.querySelector('.error-text')?.textContent).toBe('An instructor is required.');
  });
  // Never a raw translation key.
  expect(document.body.textContent).not.toMatch(/catalog\.error\./);
});

it('starts on its own once the form is complete, for every file picked', async () => {
  renderUpload();
  await chooseCategory();
  await chooseInstructor();

  fireEvent.change(await screen.findByLabelText(/Video file/i),
    { target: { files: [clip('one.mp4'), clip('two.mp4')] } });

  // Both rows appear, and both upload with no further gesture.
  expect(screen.getByText('one.mp4', { exact: false })).toBeVisible();
  await waitFor(() => {
    const created = fetch.mock.calls.filter(([url, o]) => String(url).endsWith('/admin/videos') && o?.method === 'POST');
    expect(created).toHaveLength(2);
  });
});

it('picks the queue up by itself when the missing field is filled in later', async () => {
  renderUpload();
  fireEvent.change(await screen.findByLabelText(/Video file/i), { target: { files: [clip('late.mp4')] } });
  await waitFor(() => {
    expect(document.querySelector('.error-text')?.textContent).toBe('Category is required.');
  });

  await chooseCategory();
  await chooseInstructor();

  // No re-picking the file, no button: completing the form resumes the queue.
  await waitFor(() => {
    expect(fetch.mock.calls.some(([url, o]) => String(url).endsWith('/admin/videos') && o?.method === 'POST')).toBe(true);
  });
});

it('gives every queued row a progress bar, so waiting looks like a stage not a stall', async () => {
  localStorage.setItem('baytara_admin_upload_queue', JSON.stringify([
    { key: 'k1', id: 41, title: 'Converting now', name: 'a.mp4', size: 1024, status: 'packaging', progress: 100 },
  ]));
  renderUpload();

  const bar = await waitFor(() => document.querySelector('progress.upload-progress'));
  expect(bar).toBeTruthy();
  // Packaging has no percentage to report, so the bar is indeterminate rather than absent.
  expect(bar.hasAttribute('value')).toBe(false);
});

it('shows an upload that the browser interrupted, and keeps its video record', async () => {
  // What a closed tab leaves behind: a row saved mid-transfer.
  localStorage.setItem('baytara_admin_upload_queue', JSON.stringify([
    { key: 'k1', id: 41, title: 'Half sent', name: 'half.mp4', size: 1024, status: 'uploading', progress: 42 },
  ]));

  renderUpload();

  expect(await screen.findByText('Upload interrupted')).toBeVisible();
  expect(screen.getByText('Half sent')).toBeVisible();
  // The record survived, so the editor for that video is one click away.
  expect(screen.getByRole('link', { name: /Open the video editor/i })).toHaveAttribute('href', '/admin/videos/41');
});

it('drops a queued row that never reached the server, since nothing can resume it', async () => {
  // Files picked before the form was complete: no video id was ever created, and the
  // File object cannot survive the reload, so the row would only offer a dead retry.
  localStorage.setItem('baytara_admin_upload_queue', JSON.stringify([
    { key: 'k1', title: 'Never started', name: 'never.mp4', size: 2048, status: 'queued', progress: 0 },
    { key: 'k2', id: 41, title: 'Half sent', name: 'half.mp4', size: 1024, status: 'uploading', progress: 42 },
  ]));

  renderUpload();

  expect(await screen.findByText('Half sent')).toBeVisible();
  expect(screen.queryByText('Never started')).toBeNull();
  // The one with a video behind it offers to finish, without redoing the form.
  expect(screen.getByText('Pick the file again')).toBeVisible();
});

it('keeps the form and the queue through an upload, instead of remounting the page', async () => {
  // Creating the video used to fire the admin data-changed event, and the shell keys the
  // active page on a revision counter — so the page remounted mid-transfer, the form
  // reset, and the row vanished before its id had been stored.
  renderUpload();
  await chooseCategory();
  await chooseInstructor();
  fireEvent.change(await screen.findByLabelText(/Video file/i), { target: { files: [clip('one.mp4')] } });

  await waitFor(() => {
    expect(fetch.mock.calls.some(([url, o]) => String(url).endsWith('/admin/videos') && o?.method === 'POST')).toBe(true);
  });

  // Still the same page: the choices stand and the row is still on screen.
  expect(screen.getByLabelText(/Category/i)).toHaveValue('1');
  expect(screen.getByLabelText(/Instructor/i)).toHaveValue('8');
  expect(screen.getByText('one.mp4', { exact: false })).toBeVisible();
});
