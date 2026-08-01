/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { setToken } from '../src/api.js';
import { LanguageProvider } from '../src/i18n.jsx';

const settings = {
  header: { welcome: { ar: 'أهلاً', en: 'Welcome' }, app_label: { ar: 'التطبيق', en: 'App' }, help_label: { ar: 'مساعدة', en: 'Help' } },
  hero: {
    eyebrow: { ar: 'تعلم بيطري', en: 'Veterinary learning' },
    title: { ar: 'العنوان', en: 'Title' }, subtitle: { ar: 'الوصف', en: 'Subtitle' },
    primary_cta: { ar: 'ابدأ', en: 'Start' }, secondary_cta: { ar: 'شاهد', en: 'Watch' },
    featured_label: { ar: 'مميز', en: 'Featured' }, featured_title: { ar: 'دورة', en: 'Course' },
  },
  home: { testimonials_title: { ar: 'الآراء', en: 'Testimonials' } },
  stats: [
    { num: '1', label: { ar: 'الأول', en: 'First' } },
    { num: '2', label: { ar: 'الثاني', en: 'Second' } },
  ],
  testimonials: [],
  about: { title: { ar: 'من نحن', en: 'About' }, body: { ar: 'النص', en: 'Body' }, values: [] },
  business: { title: { ar: 'الأعمال', en: 'Business' }, body: { ar: 'نص', en: 'Text' }, stats: [], features: [], logos: [], trust: { ar: 'ثقة', en: 'Trust' } },
  contact: { title: { ar: 'تواصل', en: 'Contact' }, subtitle: { ar: 'اتصل', en: 'Call us' }, email: 'hello@baytara.app', phone: '', address: { ar: '', en: '' }, hours: { ar: '', en: '' } },
  socials: { facebook: '', instagram: '', youtube: '', whatsapp: '' },
  footer: { tagline: { ar: 'تذييل', en: 'Footer' }, copyright: { ar: 'حقوق', en: 'Copyright' } },
  secret_vdocipher: 'stored-secret',
  secret_fawaterk_client_id: 'stored-client',
};

function response(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function renderSettings() {
  window.history.replaceState({}, '', '/admin/settings');
  return render(
    <BrowserRouter basename="/admin" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider><App /></LanguageProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_admin_language', 'en');
  setToken('settings-token');
  vi.stubGlobal('fetch', vi.fn((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return response({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/settings') && options.method === 'PUT') return response({ settings });
    if (url.endsWith('/admin/settings')) return response({ settings });
    return response({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('shows six fixed-design tabs and bilingual fields', async () => {
  renderSettings();

  expect(await screen.findByRole('heading', { name: 'Site settings' })).toBeVisible();
  ['Home', 'About', 'Business', 'Contact', 'Footer', 'Integrations'].forEach((name) => {
    expect(screen.getByRole('button', { name })).toBeVisible();
  });
  expect(screen.getByLabelText('Arabic title')).toHaveValue('العنوان');
  expect(screen.getByLabelText('English title')).toHaveValue('Title');
});

it('updates the actual-site preview before saving without exposing secrets', async () => {
  const user = userEvent.setup();
  renderSettings();
  const frame = await screen.findByTitle('Website live preview');
  const postMessage = vi.fn();
  Object.defineProperty(frame, 'contentWindow', { configurable: true, value: { postMessage } });

  await user.type(screen.getByLabelText('English title'), ' Updated');
  fireEvent.load(frame);

  await waitFor(() => expect(postMessage).toHaveBeenCalled());
  const [message, targetOrigin] = postMessage.mock.calls.at(-1);
  expect(targetOrigin).toBe(window.location.origin);
  expect(message.type).toBe('baytara:site-settings-preview');
  expect(message.settings.hero.title).toBe('Title Updated');
  expect(JSON.stringify(message.settings)).not.toContain('stored-secret');
  expect(JSON.stringify(message.settings)).not.toContain('secret_');
});

it('switches preview language and path', async () => {
  const user = userEvent.setup();
  renderSettings();
  const frame = await screen.findByTitle('Website live preview');

  await user.selectOptions(screen.getByLabelText('Preview language'), 'ar');
  await user.selectOptions(screen.getByLabelText('Preview page'), '/about');

  expect(frame).toHaveAttribute('src', '/about?preview=1&lang=ar');
});

it('reorders repeated content and sends the bilingual PUT payload', async () => {
  const user = userEvent.setup();
  renderSettings();
  await screen.findByLabelText('English title');

  await user.click(screen.getByRole('button', { name: 'Move First down' }));
  await user.clear(screen.getByLabelText('English title'));
  await user.type(screen.getByLabelText('English title'), 'Saved title');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));

  const call = fetch.mock.calls.find(([input, options]) => String(input).endsWith('/admin/settings') && options.method === 'PUT');
  const payload = JSON.parse(call[1].body);
  expect(payload.hero.title).toEqual({ ar: 'العنوان', en: 'Saved title' });
  expect(payload.stats.map((item) => item.num)).toEqual(['2', '1']);
});

it('keeps unsaved draft content after a save failure', async () => {
  const originalFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    if (String(input).endsWith('/admin/settings') && options.method === 'PUT') return response({ error: 'failed' }, 500);
    return originalFetch(input, options);
  });
  const user = userEvent.setup();
  renderSettings();
  const field = await screen.findByLabelText('English title');

  await user.clear(field);
  await user.type(field, 'Unsaved title');
  await user.click(screen.getByRole('button', { name: 'Save settings' }));

  expect(await screen.findByText('Unable to save settings.')).toBeVisible();
  expect(screen.getByLabelText('English title')).toHaveValue('Unsaved title');
});
