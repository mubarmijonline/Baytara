/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { LanguageProvider } from '../src/i18n.jsx';
import { api, setToken } from '../src/api.js';
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
    if (url.includes('/admin/video-library')) return json({ items: [], total: 0, page: 1, pages: 1, per_page: 40 });
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
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library')) return json({ items: [], total: 0, page: 1, pages: 1, per_page: 40 });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'الخيول', name_en: 'Equine' }] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  const user = userEvent.setup();
  renderAdmin('/admin/videos?folder=f1&view=table&category=equine');

  expect(await screen.findByTestId('video-table')).toBeVisible();
  await user.click(screen.getByRole('button', { name: /grid/i }));

  expect(window.location.search).toContain('folder=f1');
  expect(window.location.search).toContain('category=equine');
  expect(window.location.search).toContain('view=grid');
});

it('ignores stale library results after a URL filter changes', async () => {
  const oldLibrary = deferred();
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/video-library') && url.includes('q=old')) return oldLibrary.promise;
    if (url.includes('/admin/video-library') && url.includes('q=new')) return json({
      items: [{ id: 'new-video', provider_id: 'new-video', title: 'New result', status: 'ready' }],
      total: 1, page: 1, pages: 1, per_page: 40,
    });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  renderAdmin('/admin/videos?q=old');

  await waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).includes('q=old'))).toBe(true));
  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'new' } });
  expect(await screen.findByText('New result')).toBeVisible();

  oldLibrary.resolve(new Response(JSON.stringify({
    items: [{ id: 'old-video', provider_id: 'old-video', title: 'Old result', status: 'ready' }],
    total: 1, page: 1, pages: 1, per_page: 40,
  }), { headers: { 'Content-Type': 'application/json' } }));
  await waitFor(() => expect(screen.queryByText('Old result')).toBeNull());
  expect(screen.getByText('New result')).toBeVisible();
});

it('passes an AbortSignal through the API client without dropping authorization', async () => {
  const controller = new AbortController();
  await api.videoLibrary({ page: 1 }, { signal: controller.signal });
  const [, options] = fetch.mock.calls.find(([input]) => String(input).includes('/admin/video-library'));
  expect(options.signal).toBe(controller.signal);
  expect(options.headers.Authorization).toBe('Bearer test-token');
});

it('debounces search, aborts the superseded load, and keeps visible results on AbortError', async () => {
  let oldSignal;
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    if (url.includes('/admin/video-library') && url.includes('q=old')) {
      oldSignal = options.signal;
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    }
    if (url.includes('/admin/video-library') && url.includes('q=new')) return json({
      items: [{ id: 'new-video', provider_id: 'new-video', title: 'New result', status: 'ready' }],
      total: 1, page: 1, pages: 1, per_page: 40,
    });
    if (url.includes('/admin/video-library')) return json({
      items: [{ id: 'visible-video', provider_id: 'visible-video', title: 'Visible result', status: 'ready' }],
      total: 1, page: 1, pages: 1, per_page: 40,
    });
    return json({});
  });
  renderAdmin('/admin/videos');
  expect(await screen.findByText('Visible result')).toBeVisible();

  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'old' } });
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(fetch.mock.calls.some(([input]) => String(input).includes('q=old'))).toBe(false);
  await waitFor(() => expect(oldSignal).toBeInstanceOf(AbortSignal));

  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'new' } });
  await waitFor(() => expect(oldSignal.aborted).toBe(true));
  expect(screen.getByText('Visible result')).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(fetch.mock.calls.some(([input]) => String(input).includes('q=new'))).toBe(false);
  expect(await screen.findByText('New result')).toBeVisible();
});

it('waits for search debounce before loading once with the newest filters', async () => {
  const libraryUrls = [];
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    if (url.includes('/admin/video-library')) {
      libraryUrls.push(url);
      const searched = url.includes('q=newest');
      return json({
        items: [{ id: searched ? 'new' : 'old', provider_id: searched ? 'new' : 'old', title: searched ? 'Newest result' : 'Visible result', status: 'ready' }],
        total: 1, page: 1, pages: 1, per_page: 40,
      });
    }
    return json({});
  });
  renderAdmin('/admin/videos');
  expect(await screen.findByText('Visible result')).toBeVisible();
  const callsBeforeSearch = libraryUrls.length;

  fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'newest' } });
  fireEvent.change(screen.getByLabelText('Access type'), { target: { value: 'general' } });

  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(libraryUrls).toHaveLength(callsBeforeSearch);
  expect(screen.getByText('Visible result')).toBeVisible();
  expect(await screen.findByText('Newest result')).toBeVisible();
  expect(libraryUrls.slice(callsBeforeSearch)).toHaveLength(1);
  expect(libraryUrls.at(-1)).toContain('q=newest');
  expect(libraryUrls.at(-1)).toContain('access_type=general');
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled();
});

it('disables refresh while loading and coalesces repeated refresh clicks', async () => {
  const refreshResult = deferred();
  let refreshCalls = 0;
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    if (url.includes('/admin/video-library') && url.includes('refresh=1')) {
      refreshCalls += 1;
      return refreshResult.promise;
    }
    if (url.includes('/admin/video-library')) return json({
      items: [{ id: 'visible-video', provider_id: 'visible-video', title: 'Visible result', status: 'ready' }],
      total: 1, page: 1, pages: 1, per_page: 40,
    });
    return json({});
  });
  renderAdmin('/admin/videos');
  expect(await screen.findByText('Visible result')).toBeVisible();
  const refresh = screen.getByRole('button', { name: 'Refresh' });
  fireEvent.click(refresh);
  fireEvent.click(refresh);
  expect(refresh).toBeDisabled();
  expect(refreshCalls).toBe(1);
  refreshResult.resolve(new Response(JSON.stringify({
    items: [{ id: 'fresh-video', provider_id: 'fresh-video', title: 'Fresh result', status: 'ready' }],
    total: 1, page: 1, pages: 1, per_page: 40,
  }), { headers: { 'Content-Type': 'application/json' } }));
  expect(await screen.findByText('Fresh result')).toBeVisible();
  expect(refresh).toBeEnabled();
});

it('uses the branded fallback when a provider poster is absent', () => {
  render(<MemoryRouter><LanguageProvider><VideoViews view="grid" videos={[{ id: 'v1', title: 'Exam' }]} /></LanguageProvider></MemoryRouter>);

  expect(screen.getByRole('img', { name: /fallback poster/i })).toBeVisible();
});

it('opens a video details panel from the library card without leaving the library', async () => {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={['/videos']}>
      <LanguageProvider>
        <VideoViews
          view="grid"
          videos={[{
            id: 'v1',
            provider_id: 'v1',
            title: 'Provider exam',
            status: 'ready',
            duration_seconds: 125,
            uploaded_at: '2026-08-01T10:00:00Z',
            catalog: {
              id: 7,
              title: 'Exam',
              description: 'Detailed notes',
              status: 'published',
              access_type: 'free',
              category: { name: 'Equine', name_en: 'Equine' },
              courses: [{ id: 4, title: 'Dawara A', title_en: 'Course A' }],
            },
          }]}
        />
      </LanguageProvider>
    </MemoryRouter>,
  );

  await user.click(screen.getByRole('button', { name: /view details for exam/i }));

  expect(screen.getByRole('dialog', { name: /exam/i })).toBeVisible();
  expect(screen.getByText('Detailed notes')).toBeVisible();
  expect(screen.getByText('Course A')).toBeVisible();
  expect(screen.getByRole('link', { name: /edit metadata/i })).toHaveAttribute('href', '/videos/7');
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

it('shows a single folder error and retries when the folder is reopened', async () => {
  let folderCalls = 0;
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/folders/root')) return json({ folders: [{ id: 'f1', name: 'Equine' }] });
    if (url.endsWith('/folders/f1')) {
      folderCalls += 1;
      return folderCalls === 1 ? json({ error: 'load_failed' }, 503) : json({ folders: [{ id: 'f2', name: 'Cases' }] });
    }
    return json({});
  });
  const user = userEvent.setup();
  render(<LanguageProvider><VideoFolderTree selectedId="root" onSelect={() => {}} /></LanguageProvider>);

  expect(await screen.findByRole('button', { name: 'Equine' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: /expand folder/i }));
  expect(await screen.findByText('Unable to load.')).toBeVisible();
  expect(screen.queryByText('Loading…')).toBeNull();

  await user.click(screen.getAllByRole('button', { name: /collapse folder/i })[1]);
  await user.click(screen.getByRole('button', { name: /expand folder/i }));
  expect(await screen.findByRole('button', { name: 'Cases' })).toBeVisible();
  expect(screen.queryByText('Unable to load.')).toBeNull();
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
  expect(JSON.parse(importCalls[1][1].body)).toMatchObject({
    video_id: 'retry-123', description_en: 'English notes', sync_provider_metadata: true,
  });
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

it('backfills canonical poster and duration when provider processing finishes', async () => {
  let synced = null;
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/videos/7') && (!options.method || options.method === 'GET')) return json({ video: { id: 7, title: 'Exam', description: 'Notes', category: { id: 1 }, vdocipher_video_id: 'v1', access_type: 'free', status: 'published', courses: [] } });
    if (url.endsWith('/admin/videos/7') && options.method === 'PATCH') { synced = JSON.parse(options.body); return json({ video: { id: 7 } }); }
    if (url.endsWith('/admin/vdocipher/videos/v1')) return json({ video: { id: 'v1', title: 'Exam', description: 'Notes', status: 'ready', poster: 'https://cdn.test/exam.jpg', duration_seconds: 83 } });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    return json({});
  });
  renderAdmin('/admin/videos/7');

  await waitFor(() => expect(synced).toEqual({ poster: 'https://cdn.test/exam.jpg', duration_minutes: 1 }));
});

it('retries provider metadata after upload without issuing new credentials', async () => {
  class SuccessfulXhr { constructor() { this.status = 201; this.upload = {}; } open() {} send() { this.onload(); } }
  vi.stubGlobal('XMLHttpRequest', SuccessfulXhr);
  let providerUpdates = 0;
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/upload-credentials')) return json({ video_id: 'retry-provider', upload_link: 'https://upload.test', fields: {} });
    if (url.endsWith('/vdocipher/videos/retry-provider')) { providerUpdates += 1; return providerUpdates === 1 ? json({ error: 'provider_failed' }, 503) : json({ video: { id: 'retry-provider' } }); }
    if (url.endsWith('/vdocipher/import')) return json({ video: { id: 8 } });
    if (url.endsWith('/admin/videos/8')) return json({ video: { id: 8, title: 'Exam', description: 'Notes', category: { id: 1 }, vdocipher_video_id: 'retry-provider', access_type: 'general', status: 'draft', courses: [] } });
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
  await user.click(await screen.findByRole('button', { name: /retry provider metadata/i }));
  await waitFor(() => expect(screen.queryByRole('button', { name: /retry provider metadata/i })).toBeNull());
  expect(providerUpdates).toBe(2);
  expect(fetch.mock.calls.filter(([input]) => String(input).endsWith('/upload-credentials'))).toHaveLength(1);
});

it('renames the selected folder through the shared dialog', async () => {
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/folders/root')) return json({ folders: [{ id: 'f1', name: 'Equine' }] });
    if (url.endsWith('/folders/f1') && options.method === 'PATCH') return json({ folder: { id: 'f1', name: 'Cases' } });
    return json({});
  });
  const user = userEvent.setup();
  render(<LanguageProvider><DialogHost /><VideoFolderTree selectedId="f1" onSelect={() => {}} /></LanguageProvider>);

  await user.click(screen.getByRole('button', { name: /rename folder/i }));
  await user.type(screen.getByRole('textbox'), 'Cases');
  await user.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(fetch.mock.calls.some(([input, options]) => String(input).endsWith('/folders/f1') && options.method === 'PATCH' && JSON.parse(options.body).name === 'Cases')).toBe(true));
});

it('moves a provider video to the URL-selected folder', async () => {
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/videos/7')) return json({ video: { id: 7, title: 'Exam', description: 'Notes', category: { id: 1 }, vdocipher_video_id: 'v1', access_type: 'general', status: 'draft', courses: [] } });
    if (url.endsWith('/admin/vdocipher/videos/v1')) return json({ video: { id: 'v1', title: 'Exam', description: 'Notes', status: 'ready' } });
    if (url.endsWith('/admin/vdocipher/move') && options.method === 'POST') return json({ ok: true });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  const user = userEvent.setup();
  renderAdmin('/admin/videos/7?folder=f2');
  await user.click(await screen.findByRole('button', { name: /move to this folder/i }));
  await waitFor(() => expect(fetch.mock.calls.some(([input, options]) => String(input).endsWith('/admin/vdocipher/move') && JSON.parse(options.body).folder_id === 'f2' && JSON.parse(options.body).video_ids[0] === 'v1')).toBe(true));
});

it('keeps root canonical records beyond the current provider page and exposes page controls', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library') && url.includes('page=2')) return json({
      total: 80, page: 2, pages: 2, per_page: 40,
      items: [
        { id: 'page-two', provider_id: 'page-two', title: 'Page two provider', status: 'ready' },
        { id: 'canonical-missing', provider_id: 'canonical-missing', title: 'Canonical beyond provider page', status: 'ready', catalog: { id: 9, category: { name: 'Equine' }, access_type: 'general', status: 'draft', courses: [] } },
      ],
    });
    if (url.includes('/admin/video-library')) return json({
      total: 80, page: 1, pages: 2, per_page: 40,
      items: [{ id: 'page-one', provider_id: 'page-one', title: 'Page one provider', status: 'ready' }],
    });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  const user = userEvent.setup();
  renderAdmin('/admin/videos?page=2');
  expect(await screen.findByText('Canonical beyond provider page')).toBeVisible();
  expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: /previous page/i }));
  expect(window.location.search).not.toContain('page=2');
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/admin/video-library') && String(input).includes('page=2') && String(input).includes('per_page=40'))).toBe(true);
});

it('separates provider encoding status from local publication and assignment filters', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library')) return json({
      total: 1, page: 1, pages: 1, per_page: 40,
      items: [{ id: 'ready-v', provider_id: 'ready-v', title: 'Ready provider', status: 'ready', catalog: { id: 1, title: 'Ready local', status: 'published', category: { name: 'Equine' }, access_type: 'general', courses: [{ id: 4, title: 'Dawara' }] } }],
    });
    if (url.includes('/admin/courses')) return json({ courses: [{ id: 4, title: 'Dawara' }] });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  const user = userEvent.setup();
  renderAdmin('/admin/videos?status=ready&publication=published&course=4&assignment=assigned');
  expect(await screen.findByText('Ready local')).toBeVisible();
  expect(screen.queryByText('Ready provider')).toBeNull();
  expect(screen.queryByText('Encoding provider')).toBeNull();
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/admin/video-library') && String(input).includes('course_id=4') && String(input).includes('status=ready') && String(input).includes('publication=published'))).toBe(true);
  await user.click(screen.getByRole('button', { name: /table/i }));
  expect(window.location.search).toContain('status=ready');
  expect(window.location.search).toContain('publication=published');
  expect(window.location.search).toContain('course=4');
  expect(window.location.search).toContain('assignment=assigned');
});

it('renders operational metadata in every library view', () => {
  const video = { id: 'provider-1', title: 'Exam', status: 'ready', duration_seconds: 120, uploaded_at: '2026-08-01', catalog: { category: { name: 'Equine' }, access_type: 'general', courses: [{ id: 1, title: 'Dawara One' }] } };
  const { rerender } = render(<MemoryRouter><LanguageProvider><VideoViews view="grid" videos={[video]} /></LanguageProvider></MemoryRouter>);
  expect(screen.getByText('Equine')).toBeVisible();
  expect(screen.getByText(/paid for non-veterinarians/i)).toBeVisible();
  expect(screen.getByText(/1 course/i)).toBeVisible();
  rerender(<MemoryRouter><LanguageProvider><VideoViews view="list" videos={[video]} /></LanguageProvider></MemoryRouter>);
  expect(screen.getByTestId('video-list')).toHaveTextContent('Equine');
  rerender(<MemoryRouter><LanguageProvider><VideoViews view="table" videos={[video]} /></LanguageProvider></MemoryRouter>);
  expect(screen.getByTestId('video-table')).toHaveTextContent('2026-08-01');
  expect(screen.getByTestId('video-table')).toHaveTextContent('Dawara One');
});

it('does not render a file input when importing a provider-only video', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/videos/v1')) return json({ error: 'not_found' }, 404);
    if (url.endsWith('/admin/vdocipher/videos/v1')) return json({ video: { id: 'v1', title: 'Provider exam', description: 'Notes', status: 'ready' } });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'Equine' }] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  renderAdmin('/admin/videos/v1');
  await screen.findByRole('button', { name: /^import$/i });
  expect(screen.queryByLabelText('Video file')).toBeNull();
});

it('uses the composite library endpoint with URL filters and server pagination', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library')) return json({ items: [{ id: 'provider-2', provider_id: 'provider-2', title: 'Second page', status: 'ready', catalog: { id: 2, category: { name: 'Equine' }, access_type: 'general', status: 'published', courses: [{ id: 4, title: 'Dawara' }] } }], total: 80, page: 2, pages: 2, per_page: 40 });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/courses')) return json({ courses: [{ id: 4, title: 'Dawara' }] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  renderAdmin('/admin/videos?folder=f1&q=exam&status=ready&publication=published&course=4&assignment=assigned&page=2');
  expect(await screen.findByText('Second page')).toBeVisible();
  expect(fetch.mock.calls.some(([input]) => {
    const url = String(input);
    return url.includes('/admin/video-library') && url.includes('folder_id=f1') && url.includes('q=exam') && url.includes('status=ready') && url.includes('publication=published') && url.includes('course_id=4') && url.includes('assignment=assigned') && url.includes('page=2') && url.includes('per_page=40');
  })).toBe(true);
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/admin/vdocipher/videos'))).toBe(false);
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/admin/videos?'))).toBe(false);
});

it('normalizes malformed library page URLs before requesting page one', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library')) return json({ items: [], total: 0, page: 1, pages: 1, per_page: 40 });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  renderAdmin('/admin/videos?page=banana');
  await screen.findByTestId('video-grid');
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/admin/video-library') && String(input).includes('page=1'))).toBe(true);
  expect(fetch.mock.calls.some(([input]) => String(input).includes('page=NaN'))).toBe(false);
});

it('synchronizes a server-clamped page back to the URL', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library')) return json({ items: [], total: 41, page: 2, pages: 2, per_page: 40 });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  renderAdmin('/admin/videos?page=999');
  await screen.findByTestId('video-grid');
  await waitFor(() => expect(window.location.search).toContain('page=2'));
  expect(window.location.search).not.toContain('page=999');
});

it('removes an unknown category slug after categories load', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library')) return json({ items: [], total: 0, page: 1, pages: 1, per_page: 40 });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 1, slug: 'equine', name: 'الخيول', name_en: 'Equine' }] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  renderAdmin('/admin/videos?category=unknown');
  await waitFor(() => expect(window.location.search).not.toContain('category=unknown'));
});

it('removes a returned category slug that is outside the fixed catalog', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library')) return json({ items: [], total: 0, page: 1, pages: 1, per_page: 40 });
    if (url.endsWith('/categories')) return json({ categories: [{ id: 9, slug: 'legacy-equine', name: 'Legacy' }] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  renderAdmin('/admin/videos?category=legacy-equine');
  await waitFor(() => expect(window.location.search).not.toContain('category=legacy-equine'));
  expect(fetch.mock.calls.some(([input]) => String(input).includes('/admin/video-library') && String(input).includes('category_id=9'))).toBe(false);
});

it('renders composite local-only records only on the page returned by the server', async () => {
  fetch.mockImplementation((input) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return json({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.includes('/admin/video-library') && url.includes('page=2')) return json({ items: [{ id: 'provider-2', provider_id: 'provider-2', title: 'Provider two', status: 'ready' }], total: 41, page: 2, pages: 2, per_page: 40 });
    if (url.includes('/admin/video-library')) return json({ items: [{ id: 'catalog-9', provider_id: null, title: 'Local only once', status: null, catalog: { id: 9, access_type: 'free', status: 'draft', courses: [] } }], total: 41, page: 1, pages: 2, per_page: 40 });
    if (url.endsWith('/categories')) return json({ categories: [] });
    if (url.includes('/admin/courses')) return json({ courses: [] });
    if (url.includes('/folders/')) return json({ folders: [] });
    return json({});
  });
  const user = userEvent.setup();
  renderAdmin('/admin/videos');
  expect(await screen.findByText('Local only once')).toBeVisible();
  await user.click(screen.getByRole('button', { name: /next page/i }));
  expect(await screen.findByText('Provider two')).toBeVisible();
  expect(screen.queryByText('Local only once')).toBeNull();
});

it('renders distinct provider and publication chips in every view', () => {
  const video = { id: 'provider-1', provider_id: 'provider-1', title: 'Exam', status: 'ready', catalog: { status: 'published', access_type: 'general', courses: [] } };
  const { rerender } = render(<MemoryRouter><LanguageProvider><VideoViews view="grid" videos={[video]} /></LanguageProvider></MemoryRouter>);
  expect(screen.getByText('Ready')).toBeVisible();
  expect(screen.getByText('Published')).toHaveClass('chip-published');
  rerender(<MemoryRouter><LanguageProvider><VideoViews view="list" videos={[video]} /></LanguageProvider></MemoryRouter>);
  expect(screen.getByTestId('video-list')).toHaveTextContent('Published');
  rerender(<MemoryRouter><LanguageProvider><VideoViews view="table" videos={[video]} /></LanguageProvider></MemoryRouter>);
  expect(screen.getByTestId('video-table')).toHaveTextContent('Published');
  expect(screen.getByTestId('video-table-scroll')).toBeVisible();
});

it('uses canonical bilingual catalog metadata and provider-only fallbacks', () => {
  const canonical = {
    id: 'provider-1', provider_id: 'provider-1', title: 'Provider title', status: 'ready',
    catalog: {
      id: 7, title: 'فحص الخيول', title_en: 'Equine exam', status: 'published', access_type: 'general',
      category: { name: 'الخيول', name_en: 'Equine' },
      courses: [{ id: 1, title: 'دورة الخيول', title_en: 'Equine course' }],
    },
  };
  const providerOnly = {
    id: 'provider-2', provider_id: 'provider-2', title: 'Provider-only title', status: 'ready',
  };

  const english = render(
    <MemoryRouter><LanguageProvider><VideoViews view="table" videos={[canonical, providerOnly]} /></LanguageProvider></MemoryRouter>,
  );
  expect(screen.getByText('Equine exam')).toBeVisible();
  expect(screen.getByText('Equine')).toBeVisible();
  expect(screen.getByText('Equine course')).toBeVisible();
  expect(screen.getByText('Provider-only title')).toBeVisible();
  expect(screen.queryByText('Provider title')).toBeNull();
  english.unmount();

  localStorage.setItem('baytara_admin_language', 'ar');
  render(<MemoryRouter><LanguageProvider><VideoViews view="table" videos={[canonical]} /></LanguageProvider></MemoryRouter>);
  expect(screen.getByText('فحص الخيول')).toBeVisible();
  expect(screen.getByText('الخيول')).toBeVisible();
  expect(screen.getByText('دورة الخيول')).toBeVisible();
  expect(screen.queryByText('Equine exam')).toBeNull();
});
