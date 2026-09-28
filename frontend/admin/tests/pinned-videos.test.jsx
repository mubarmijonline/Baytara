/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PinnedVideos from '../src/components/PinnedVideos.jsx';
import { LanguageProvider } from '../src/i18n.jsx';
import { setToken } from '../src/api.js';

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

let pinned;
let saves;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_admin_language', 'en');
  setToken('test-token');
  pinned = [
    { id: 1, title: 'Welcome', status: 'published' },
    { id: 2, title: 'How it works', status: 'published' },
  ];
  saves = [];
  vi.stubGlobal('fetch', vi.fn((input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/videos/pinned') && init.method === 'PUT') {
      const ids = JSON.parse(init.body).video_ids;
      saves.push(ids);
      const all = [...pinned, { id: 3, title: 'Surgery basics', status: 'published' }];
      return json({ videos: ids.map((id, i) => ({ ...all.find((v) => v.id === id), library_rank: i + 1 })), max: 12 });
    }
    if (url.endsWith('/admin/videos/pinned')) return json({ videos: pinned, max: 12 });
    if (url.includes('/admin/videos?')) return json({ items: [{ id: 3, title: 'Surgery basics', status: 'published' }, pinned[0]] });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.unstubAllGlobals();
});

const renderPanel = () => render(<LanguageProvider><PinnedVideos /></LanguageProvider>);

it('reorders, adds and saves the pinned list as one ordered set of ids', async () => {
  const user = userEvent.setup();
  renderPanel();
  expect(await screen.findByText('1. Welcome')).toBeVisible();
  const save = screen.getByRole('button', { name: /save order/i });
  expect(save).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Move down: Welcome' }));
  expect(screen.getByText('1. How it works')).toBeVisible();
  expect(save).toBeEnabled();

  await user.type(screen.getByRole('searchbox'), 'surg');
  // An already pinned video is not offered a second time.
  const pin = await screen.findByRole('button', { name: /^pin$/i });
  expect(screen.getAllByRole('button', { name: /^pin$/i })).toHaveLength(1);
  await user.click(pin);
  expect(screen.getByText('3. Surgery basics')).toBeVisible();

  await user.click(save);
  await waitFor(() => expect(saves).toEqual([[2, 1, 3]]));
  await waitFor(() => expect(save).toBeDisabled());
});

it('unpins a video by removing it from the list', async () => {
  const user = userEvent.setup();
  renderPanel();
  await screen.findByText('1. Welcome');
  await user.click(screen.getByRole('button', { name: 'Remove: Welcome' }));
  await user.click(screen.getByRole('button', { name: /save order/i }));
  await waitFor(() => expect(saves).toEqual([[2]]));
});
