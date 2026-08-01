/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { LanguageProvider } from '../src/i18n.jsx';
import { setToken } from '../src/api.js';
import VideoFolderTree from '../src/components/VideoFolderTree.jsx';
import VideoViews from '../src/components/VideoViews.jsx';
import { DialogHost } from '../src/dialog.jsx';

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function deferred() {
  let resolve;
  const promise = new Promise((finish) => { resolve = finish; });
  return { promise, resolve };
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

it('ignores stale library results after a URL filter changes', async () => {
  const oldProvider = deferred();
  const oldCatalog = deferred();
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/vdocipher/videos') && url.includes('q=old')) return oldProvider.promise;
    if (url.includes('/admin/videos') && url.includes('q=old')) return oldCatalog.promise;
    if (url.includes('/vdocipher/videos') && url.includes('q=new')) return json({ videos: [{ id: 'new-video', title: 'New result' }] });
    if (url.includes('/admin/videos') && url.includes('q=new')) return json({ items: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  renderAdmin('/admin/videos?q=old');

  await waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes('q=old'))).toBe(true));
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'new' } });
  expect(await screen.findByText('New result')).toBeVisible();

  oldProvider.resolve(new Response(JSON.stringify({ videos: [{ id: 'old-video', title: 'Old result' }] }), { headers: { 'Content-Type': 'application/json' } }));
  oldCatalog.resolve(new Response(JSON.stringify({ items: [] }), { headers: { 'Content-Type': 'application/json' } }));
  await waitFor(() => expect(screen.queryByText('Old result')).toBeNull());
  expect(screen.getByText('New result')).toBeVisible();
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

it('selects a nested folder from the reusable folder picker', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/folders/root')) return json({ folders: [{ id: 'f1', name: 'Equine' }] });
    if (url.endsWith('/folders/f1')) return json({ folders: [{ id: 'f2', name: 'Cases' }] });
    return json({});
  });
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<LanguageProvider><VideoFolderTree selectedId="root" onSelect={onSelect} /></LanguageProvider>);

  await user.click(await screen.findByRole('button', { name: 'Equine' }));
  expect(onSelect).toHaveBeenCalledWith('f1');
  await user.click(screen.getByRole('button', { name: /expand folder/i }));
  await user.click(await screen.findByRole('button', { name: 'Cases' }));
  expect(onSelect).toHaveBeenCalledWith('f2');
});

it('creates and deletes selected provider folders through the shared dialog', async () => {
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/folders/root')) return json({ folders: [{ id: 'f1', name: 'Equine' }] });
    if (url.endsWith('/vdocipher/folders') && options.method === 'POST') return json({ folder: { id: 'f2', name: 'Cases' } });
    if (url.endsWith('/folders/f1') && options.method === 'DELETE') return json({});
    return json({});
  });
  const onSelect = vi.fn();
  const user = userEvent.setup();
  render(<LanguageProvider><DialogHost /><VideoFolderTree selectedId="f1" onSelect={onSelect} /></LanguageProvider>);

  await user.click(screen.getByRole('button', { name: /create child folder/i }));
  await user.type(screen.getByRole('textbox'), 'Cases');
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(fetch.mock.calls.some(([input, options]) => String(input).endsWith('/vdocipher/folders') && options.method === 'POST' && JSON.parse(options.body).parent_id === 'f1')).toBe(true));
  expect(onSelect).toHaveBeenCalledWith('f2');

  await user.click(screen.getByRole('button', { name: /delete folder/i }));
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(fetch.mock.calls.some(([input, options]) => String(input).endsWith('/folders/f1') && options.method === 'DELETE')).toBe(true));
  expect(onSelect).toHaveBeenCalledWith('root');
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

it('does not claim partial upload success when the signed XHR fails', async () => {
  class FailedXhr {
    constructor() { this.status = 0; this.upload = {}; }
    open() {}
    send() { this.onerror(); }
  }
  vi.stubGlobal('XMLHttpRequest', FailedXhr);
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/upload-credentials')) return json({ video_id: 'not-uploaded', upload_link: 'https://upload.test', fields: {} });
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

  expect(await screen.findByText(/unable to upload/i)).toBeVisible();
  expect(screen.queryByText(/not-uploaded/i)).toBeNull();
  expect(fetch.mock.calls.some(([input]) => String(input).endsWith('/vdocipher/import'))).toBe(false);
});

it('retries a failed import from the stored upload payload without new credentials', async () => {
  class SuccessfulXhr { constructor() { this.status = 201; this.upload = {}; } open() {} send() { this.onload(); } }
  vi.stubGlobal('XMLHttpRequest', SuccessfulXhr);
  let imports = 0;
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/upload-credentials')) return json({ video_id: 'retry-123', upload_link: 'https://upload.test', fields: {} });
    if (url.endsWith('/vdocipher/videos/retry-123')) return json({ message: 'updated' });
    if (url.endsWith('/vdocipher/import')) { imports += 1; return imports === 1 ? json({ error: 'import_failed' }, 503) : json({ video: { id: 9 } }); }
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    return json({});
  });
  const user = userEvent.setup();
  renderAdmin('/admin/videos/new');
  await screen.findByText(/catalog metadata/i);
  await user.type(screen.getAllByRole('textbox')[0], 'Exam');
  await user.type(screen.getAllByRole('textbox')[2], 'Notes');
  await user.type(screen.getAllByRole('textbox')[3], 'English notes');
  await user.selectOptions(screen.getAllByRole('combobox')[0], '1');
  await user.upload(document.querySelector('input[type="file"]'), new File(['video'], 'exam.mp4', { type: 'video/mp4' }));
  await user.click(screen.getByRole('button', { name: /upload video/i }));
  expect(await screen.findByRole('button', { name: /retry import/i })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /retry import/i }));
  await waitFor(() => expect(imports).toBe(2));
  expect(fetch.mock.calls.filter(([input]) => String(input).endsWith('/upload-credentials'))).toHaveLength(1);
  expect(fetch.mock.calls.findIndex(([input]) => String(input).endsWith('/vdocipher/videos/retry-123'))).toBeLessThan(
    fetch.mock.calls.findIndex(([input]) => String(input).endsWith('/vdocipher/import')),
  );
  const importCalls = fetch.mock.calls.filter(([input]) => String(input).endsWith('/vdocipher/import'));
  expect(JSON.parse(importCalls[1][1].body)).toMatchObject({ video_id: 'retry-123', description_en: 'English notes' });
});

it('keeps local metadata visible when the provider request fails', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/videos/7')) return json({ video: { id: 7, title: 'Exam', description: 'Notes', description_en: 'English notes', category: { id: 1 }, vdocipher_video_id: 'v1', access_type: 'general', status: 'draft', courses: [] } });
    if (url.endsWith('/admin/vdocipher/videos/v1')) return json({ error: 'no_api_key' }, 503);
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    return json({});
  });
  renderAdmin('/admin/videos/7');
  expect(await screen.findByDisplayValue('Exam')).toBeVisible();
  expect(await screen.findByText(/api key is not configured/i)).toBeVisible();
  expect(
    within(screen.getByText(/api key is not configured/i).closest('.error-text')).getByRole('link', {
      name: /site settings/i,
    }),
  ).toBeVisible();
});
