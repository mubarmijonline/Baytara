/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getLang, webapi } from './api.js';
import { SiteSettingsProvider, useSiteSettings } from './site-settings.jsx';

function Probe({ name }) {
  const settings = useSiteSettings();
  return <div>{name}: {settings.hero?.title}</div>;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/?preview=1');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('fetches settings once for all consumers and applies a valid same-origin preview', async () => {
  const request = vi.spyOn(webapi, 'settings').mockResolvedValue({
    settings: { hero: { title: 'Saved title' } },
  });
  render(
    <SiteSettingsProvider>
      <Probe name="First" />
      <Probe name="Second" />
    </SiteSettingsProvider>,
  );

  expect(await screen.findByText('First: Saved title')).toBeVisible();
  expect(screen.getByText('Second: Saved title')).toBeVisible();
  expect(request).toHaveBeenCalledTimes(1);

  act(() => window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin,
    data: { type: 'baytara:site-settings-preview', settings: { hero: { title: 'Draft title' } } },
  })));
  expect(await screen.findByText('First: Draft title')).toBeVisible();
});

it.each([
  ['wrong origin', 'https://attacker.example', { type: 'baytara:site-settings-preview', settings: { hero: { title: 'Unsafe' } } }],
  ['wrong type', window.location.origin, { type: 'other-message', settings: { hero: { title: 'Unsafe' } } }],
  ['array payload', window.location.origin, { type: 'baytara:site-settings-preview', settings: [] }],
  ['secret payload', window.location.origin, { type: 'baytara:site-settings-preview', settings: { nested: { secret_token: 'no' }, hero: { title: 'Unsafe' } } }],
])('rejects %s preview messages', async (_case, origin, data) => {
  vi.spyOn(webapi, 'settings').mockResolvedValue({ settings: { hero: { title: 'Saved title' } } });
  render(<SiteSettingsProvider><Probe name="Value" /></SiteSettingsProvider>);
  await screen.findByText('Value: Saved title');

  act(() => window.dispatchEvent(new MessageEvent('message', { origin, data })));

  await waitFor(() => expect(screen.getByText('Value: Saved title')).toBeVisible());
  expect(screen.queryByText(/Unsafe/)).not.toBeInTheDocument();
});

it('does not accept preview messages outside preview mode', async () => {
  window.history.replaceState({}, '', '/');
  vi.spyOn(webapi, 'settings').mockResolvedValue({ settings: { hero: { title: 'Saved title' } } });
  render(<SiteSettingsProvider><Probe name="Value" /></SiteSettingsProvider>);
  await screen.findByText('Value: Saved title');

  act(() => window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin,
    data: { type: 'baytara:site-settings-preview', settings: { hero: { title: 'Draft title' } } },
  })));

  expect(screen.getByText('Value: Saved title')).toBeVisible();
});

it('uses the preview query language without changing the saved preference', () => {
  localStorage.setItem('baytara_lang', 'ar');
  window.history.replaceState({}, '', '/about?preview=1&lang=en');

  expect(getLang()).toBe('en');
  expect(localStorage.getItem('baytara_lang')).toBe('ar');
});

it('does not let a delayed saved-settings response overwrite a preview draft', async () => {
  let resolveRequest;
  vi.spyOn(webapi, 'settings').mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
  render(<SiteSettingsProvider><Probe name="Value" /></SiteSettingsProvider>);

  act(() => window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin,
    data: { type: 'baytara:site-settings-preview', settings: { hero: { title: 'Draft title' } } },
  })));
  expect(await screen.findByText('Value: Draft title')).toBeVisible();

  await act(async () => resolveRequest({ settings: { hero: { title: 'Saved title' } } }));
  expect(screen.getByText('Value: Draft title')).toBeVisible();
});
