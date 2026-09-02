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

it('refuses to start without a category, naming the field', async () => {
  renderUpload();
  const picker = await screen.findByLabelText(/Video file/i);
  fireEvent.change(picker, { target: { files: [clip('one.mp4')] } });

  fireEvent.click(screen.getByRole('button', { name: /Upload and process/i }));

  expect(await screen.findByText('Category is required.')).toBeVisible();
  // Nothing was created: the catalogue row is only made once the form is valid.
  expect(fetch.mock.calls.some(([url, o]) => String(url).endsWith('/admin/videos') && o?.method === 'POST')).toBe(false);
});

it('queues several files at once and creates a video for each', async () => {
  renderUpload();
  fireEvent.change(await screen.findByLabelText(/Video file/i),
    { target: { files: [clip('one.mp4'), clip('two.mp4')] } });

  // Both appear in the queue before anything is uploaded.
  expect(screen.getByText('one.mp4', { exact: false })).toBeVisible();
  expect(screen.getByText('two.mp4', { exact: false })).toBeVisible();

  fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: '1' } });
  fireEvent.change(await screen.findByLabelText(/Instructor/i), { target: { value: '8' } });
  fireEvent.click(screen.getByRole('button', { name: /Upload and process \(2\)/i }));

  await waitFor(() => {
    const created = fetch.mock.calls.filter(([url, o]) => String(url).endsWith('/admin/videos') && o?.method === 'POST');
    expect(created).toHaveLength(2);
  });
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

it('names the missing instructor instead of printing a translation key', async () => {
  renderUpload();
  fireEvent.change(await screen.findByLabelText(/Video file/i), { target: { files: [clip('one.mp4')] } });
  fireEvent.change(screen.getByLabelText(/Category/i), { target: { value: '1' } });

  fireEvent.click(screen.getByRole('button', { name: /Upload and process/i }));

  expect(await screen.findByText('An instructor is required.')).toBeVisible();
  expect(screen.queryByText(/catalog\.error\./)).toBeNull();
});
