/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { LanguageProvider } from '../src/i18n.jsx';
import { setToken } from '../src/api.js';
import VideoFolderTree from '../src/components/VideoFolderTree.jsx';
import VideoViews from '../src/components/VideoViews.jsx';

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
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
  setToken('test-token');
  vi.stubGlobal('fetch', vi.fn((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/videos')) return json({ items: [], total: 0, page: 1 });
    if (url.includes('/admin/vdocipher/videos')) return json({ videos: [] });
    if (url.includes('/admin/vdocipher/folders/')) return json({ folders: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [] });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps folder, filters, and view in the URL', async () => {
  const user = userEvent.setup();
  renderAdmin('/admin/videos?folder=f1&view=table&category=equine');

  expect(await screen.findByTestId('video-table')).toBeVisible();
  await user.click(screen.getByRole('button', { name: /grid/i }));

  expect(window.location.search).toContain('folder=f1');
  expect(window.location.search).toContain('category=equine');
  expect(window.location.search).toContain('view=grid');
});

it('uses the branded fallback when a provider poster is absent', () => {
  render(<MemoryRouter><LanguageProvider><VideoViews view="grid" videos={[{ id: 'v1', title: 'Exam' }]} /></LanguageProvider></MemoryRouter>);

  expect(screen.getByRole('img', { name: /fallback poster/i })).toBeVisible();
});

it('loads nested folders when an administrator expands a folder', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/folders/root')) return json({ folders: [{ id: 'f1', name: 'Equine' }] });
    if (url.endsWith('/folders/f1')) return json({ folders: [{ id: 'f2', name: 'Cases' }] });
    return json({});
  });
  const user = userEvent.setup();
  render(<LanguageProvider><VideoFolderTree selectedId="root" onSelect={() => {}} /></LanguageProvider>);

  expect(await screen.findByRole('button', { name: 'Equine' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /expand folder/i }));
  expect(await screen.findByRole('button', { name: 'Cases' })).toBeVisible();
});

it('shows validation before requesting upload credentials', async () => {
  const user = userEvent.setup();
  renderAdmin('/admin/videos/new');

  await user.click(await screen.findByRole('button', { name: /upload video/i }));

  expect(screen.getByText(/title is required/i)).toBeVisible();
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/upload-credentials'))).toBe(false);
});

it('shows encoding state while the provider is not ready', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/videos/7')) return json({ video: { id: 7, title: 'Exam', description: 'Notes', category: { id: 1 }, vdocipher_video_id: 'v1', access_type: 'general', status: 'draft', courses: [] } });
    if (url.endsWith('/admin/vdocipher/videos/v1')) return json({ video: { id: 'v1', title: 'Exam', description: 'Notes', status: 'preparing' } });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    return json({});
  });
  renderAdmin('/admin/videos/7');

  expect(await screen.findByText(/encoding this video/i)).toBeVisible();
  expect(screen.queryByRole('button', { name: /secure preview/i })).toBeNull();
});

it('opens an unimported provider video as an import-capable detail route', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/videos/v1')) return json({ error: 'not_found' }, 404);
    if (url.endsWith('/admin/vdocipher/videos/v1')) return json({ video: { id: 'v1', title: 'Provider exam', description: 'Notes', status: 'ready' } });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    return json({});
  });
  renderAdmin('/admin/videos/v1');

  expect(await screen.findByRole('button', { name: /^import$/i })).toBeVisible();
  expect(screen.getByRole('button', { name: /secure preview/i })).toBeVisible();
});

it('saves canonical course assignments as a set of IDs', async () => {
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/videos/7') && (!options.method || options.method === 'GET')) return json({ video: { id: 7, title: 'Exam', description: 'Notes', category: { id: 1 }, vdocipher_video_id: '', access_type: 'general', status: 'draft', courses: [{ id: 1 }] } });
    if (url.endsWith('/admin/videos/7')) return json({ video: {} });
    if (url.endsWith('/admin/videos/7/courses')) return json({ video: {} });
    if (url.includes('/admin/courses')) return json({ courses: [{ id: 1, title: 'Equine 1' }, { id: 2, title: 'Equine 2' }] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    return json({});
  });
  const user = userEvent.setup();
  renderAdmin('/admin/videos/7');

  await user.click(await screen.findByLabelText(/Equine 2/i));
  await user.click(screen.getByRole('button', { name: /^save$/i }));
  await waitFor(() => expect(fetch.mock.calls.some(([input, options]) => String(input).endsWith('/admin/videos/7/courses') && JSON.parse(options.body).course_ids.includes(1) && JSON.parse(options.body).course_ids.includes(2))).toBe(true));
});

it('keeps the uploaded provider ID visible when local import fails', async () => {
  class SuccessfulXhr {
    constructor() { this.status = 201; this.upload = {}; }
    open() {}
    send() { this.onload(); }
  }
  vi.stubGlobal('XMLHttpRequest', SuccessfulXhr);
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/upload-credentials')) return json({ video_id: 'uploaded-123', upload_link: 'https://upload.test', fields: {} });
    if (url.endsWith('/vdocipher/import')) return json({ error: 'import_failed' }, 503);
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    return json({});
  });
  const user = userEvent.setup();
  renderAdmin('/admin/videos/new');

  await screen.findByText(/catalog metadata/i);
  await user.type(screen.getAllByRole('textbox')[0], 'Exam');
  await user.type(screen.getAllByRole('textbox')[2], 'Notes');
  await user.selectOptions(screen.getAllByRole('combobox')[0], '1');
  await user.upload(document.querySelector('input[type="file"]'), new File(['video'], 'exam.mp4', { type: 'video/mp4' }));
  await user.click(screen.getByRole('button', { name: /upload video/i }));

  expect(await screen.findByText(/uploaded-123/i)).toBeVisible();
});
