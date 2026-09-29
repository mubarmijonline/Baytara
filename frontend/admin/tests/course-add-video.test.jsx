/* @vitest-environment jsdom */

// The "upload a new video to this course" panel on a course's content page.
//
// The client, 2026-09-29: uploading into a paid course reached VdoCipher and then failed
// with "paid content needs a price above zero", leaving the video on VdoCipher and not on
// Baytara. And, as a fallback for the VdoCipher plan, a way to link a video that was
// uploaded in VdoCipher's own dashboard by pasting its ID.
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { setToken } from '../src/api.js';
import { LanguageProvider } from '../src/i18n.jsx';

vi.setConfig({ testTimeout: 15_000 });

function response(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

const course = {
  id: 13, title: 'Bovine reproductive ultrasonography', access_type: 'baytarian', price: 990,
  currency: 'EGP', category: { id: 1 }, instructor: { id: 8, name: 'Dr Sara' }, videos: [],
};

let imports;
let importReply;

function renderContent() {
  window.history.replaceState({}, '', '/admin/courses/13/content');
  return render(
    <BrowserRouter basename="/admin" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider><App /></LanguageProvider>
    </BrowserRouter>,
  );
}

const panel = () => screen.getByRole('heading', { name: 'Upload a new video to this course' }).closest('section');

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_admin_language', 'en');
  setToken('test-token');
  imports = [];
  importReply = () => response({ video: { id: 77 } }, 201);
  vi.stubGlobal('XMLHttpRequest', class {
    constructor() { this.status = 201; this.upload = {}; }
    open() {} setRequestHeader() {}
    send() { this.onload(); }
  });
  vi.stubGlobal('fetch', vi.fn((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return response({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/courses/13')) return response({ course });
    if (url.endsWith('/admin/vdocipher/upload-credentials')) return response({ video_id: 'uploaded123', upload_link: 'https://upload.test', fields: {} });
    if (url.endsWith('/admin/vdocipher/import')) { imports.push(JSON.parse(options.body)); return importReply(); }
    if (url.endsWith('/admin/vdocipher/videos/abc123def456')) return response({ video: { id: 'abc123def456', title: 'Uterine scan', status: 'ready', duration_seconds: 610 } });
    if (url.endsWith('/admin/vdocipher/videos/missing999')) return response({ error: 'vdocipher_not_found' }, 404);
    if (url.includes('/courses/add')) return response({ video: { id: 77 } });
    if (url.includes('/admin/videos')) return response({ items: [], total: 0, page: 1, pages: 1 });
    return response({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('uploads into a paid course with the course price, which the server requires', async () => {
  renderContent();
  await screen.findByRole('heading', { name: 'Upload a new video to this course' });
  fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'Baytara' } });
  fireEvent.change(screen.getByLabelText('Video file'), { target: { files: [new File(['x'], 'baytara.mp4', { type: 'video/mp4' })] } });
  fireEvent.click(screen.getByRole('button', { name: /upload and add to the course/i }));

  await waitFor(() => expect(imports).toHaveLength(1));
  // It sent price 0, which the import refused after the file had reached VdoCipher.
  expect(imports[0]).toMatchObject({ video_id: 'uploaded123', access_type: 'baytarian', price: 990 });
  await waitFor(() => expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/admin/videos/77/courses/add'))).toBe(true));
});

it('keeps an upload that reached VdoCipher when adding it fails, ready to link', async () => {
  importReply = () => response({ error: 'catalog_validation_failed', errors: ['positive_price_required'] }, 422);
  renderContent();
  await screen.findByRole('heading', { name: 'Upload a new video to this course' });
  fireEvent.change(screen.getByLabelText('Video title'), { target: { value: 'Baytara' } });
  fireEvent.change(screen.getByLabelText('Video file'), { target: { files: [new File(['x'], 'baytara.mp4', { type: 'video/mp4' })] } });
  fireEvent.click(screen.getByRole('button', { name: /upload and add to the course/i }));

  // Switched to linking, with the uploaded video's ID filled in: finishing is one click.
  expect(await screen.findByDisplayValue('uploaded123')).toBeVisible();
  expect(panel().textContent).toMatch(/reached VdoCipher/);
  expect(screen.getByRole('button', { name: /link and add to the course/i })).toBeVisible();

  importReply = () => response({ video: { id: 77 } }, 201);
  fireEvent.click(screen.getByRole('button', { name: /link and add to the course/i }));
  await waitFor(() => expect(imports).toHaveLength(2));
  expect(imports[1]).toMatchObject({ video_id: 'uploaded123', sync_provider_metadata: true });
  // One upload, not two.
  expect(fetch.mock.calls.filter(([u]) => String(u).endsWith('/upload-credentials'))).toHaveLength(1);
});

it('links a video uploaded in the VdoCipher dashboard by its ID, with no file', async () => {
  renderContent();
  await screen.findByRole('heading', { name: 'Upload a new video to this course' });
  fireEvent.change(screen.getByLabelText('Where it is stored'), { target: { value: 'vdocipher_id' } });
  expect(screen.queryByLabelText('Video file')).toBeNull();

  fireEvent.change(screen.getByLabelText('VdoCipher Video ID'), { target: { value: 'missing999' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByText(/no video with this ID/i)).toBeVisible();

  fireEvent.change(screen.getByLabelText('VdoCipher Video ID'), { target: { value: 'abc123def456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check' }));
  expect(await screen.findByText(/Found on VdoCipher: Uterine scan · 10 min · ready/)).toBeVisible();
  // VdoCipher's title fills an empty one.
  expect(screen.getByLabelText('Video title')).toHaveValue('Uterine scan');

  fireEvent.click(screen.getByRole('button', { name: /link and add to the course/i }));
  await waitFor(() => expect(imports).toHaveLength(1));
  expect(imports[0]).toMatchObject({
    video_id: 'abc123def456', title: 'Uterine scan', sync_provider_metadata: true,
    access_type: 'baytarian', price: 990,
  });
  expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/upload-credentials'))).toBe(false);
  await waitFor(() => expect(fetch.mock.calls.some(([u]) => String(u).endsWith('/admin/videos/77/courses/add'))).toBe(true));
});
