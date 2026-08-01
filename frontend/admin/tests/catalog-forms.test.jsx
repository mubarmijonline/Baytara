/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../src/App.jsx';
import { setToken } from '../src/api.js';
import { LanguageProvider } from '../src/i18n.jsx';

vi.setConfig({ testTimeout: 15_000 });

const fixedCategories = [
  { id: 1, slug: 'large-animals', name: 'Large animals', name_en: 'Large animals - Cattle & Sheep' },
  { id: 2, slug: 'equine', name: 'الخيول', name_en: 'Equine' },
  { id: 3, slug: 'pet-animals', name: 'الحيوانات الأليفة', name_en: 'Pet animals' },
  { id: 4, slug: 'poultry', name: 'الدواجن والطيور', name_en: 'Poultry' },
  { id: 5, slug: 'fish-other-animal-sources', name: 'الأسماك', name_en: 'Fish and other animal sources' },
  { id: 6, slug: 'camel', name: 'الجمال', name_en: 'Camel' },
];

function response(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function renderAdmin(path) {
  window.history.replaceState({}, '', path);
  return render(
    <BrowserRouter basename="/admin" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <LanguageProvider><App /></LanguageProvider>
    </BrowserRouter>,
  );
}

function requestBody(call) {
  return JSON.parse(call[1].body);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_admin_language', 'en');
  setToken('test-token');
  vi.stubGlobal('fetch', vi.fn((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/stats')) return response({ payments: {}, baytarian: {}, courses: {}, users: {} });
    if (url.endsWith('/admin/users?role=instructor')) return response({ users: [{ id: 8, name: 'Dr Sara' }] });
    if (url.endsWith('/categories')) return response({ categories: fixedCategories });
    if (url.includes('/admin/courses')) return response({ courses: [] });
    if (url.includes('/admin/videos')) return response({ items: [], total: 0, page: 1 });
    if (url.includes('/admin/bundles')) return response({ bundles: [] });
    return response({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('creates a localized course with category and all catalog criteria on its dedicated route', async () => {
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    if (String(input).endsWith('/admin/courses') && options.method === 'POST') {
      return response({ course: { id: 17 } }, 201);
    }
    return defaultFetch(input, options);
  });
  const user = userEvent.setup();
  renderAdmin('/admin/courses/new');

  expect(await screen.findByRole('heading', { name: 'New course' })).toBeVisible();
  await user.type(screen.getByLabelText('Arabic title'), 'جراحة الخيول');
  await user.type(screen.getByLabelText('English title'), 'Equine surgery');
  await user.selectOptions(screen.getByLabelText('Instructor'), '8');
  await user.selectOptions(screen.getByLabelText('Category'), '2');
  await user.selectOptions(screen.getByLabelText('Access type'), 'baytarian');
  await user.clear(screen.getByLabelText('Price'));
  await user.type(screen.getByLabelText('Price'), '150');
  await user.selectOptions(screen.getByLabelText('Status'), 'published');
  await user.click(screen.getByRole('button', { name: 'Save course' }));

  const call = fetch.mock.calls.find(([input, options]) => String(input).endsWith('/admin/courses') && options.method === 'POST');
  expect(requestBody(call)).toMatchObject({
    title: 'جراحة الخيول', title_en: 'Equine surgery', instructor_id: 8,
    category_id: 2, access_type: 'baytarian', price: 150, currency: 'EGP', status: 'published',
  });
  await waitFor(() => expect(window.location.pathname).toBe('/admin/courses/17/content'));
});

it('assigns, uploads, removes, drags, and orders reusable videos only inside the routed course', async () => {
  const videos = [
    { id: 1, title: 'First exam', courses: [{ id: 5 }], access_type: 'free', assignment_count: 1, duration_minutes: 2, poster: 'https://media.test/first.jpg' },
    { id: 2, title: 'Second exam', courses: [{ id: 5 }, { id: 9 }], access_type: 'free', assignment_count: 2 },
  ];
  const reusable = { id: 3, title: 'Reusable exam', courses: [{ id: 9 }], access_type: 'free', assignment_count: 1 };
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/courses/5')) return response({ course: { id: 5, title: 'Equine course', videos } });
    if (url.includes('/admin/videos') && (!options.method || options.method === 'GET')) return response({ items: [reusable], total: 1, page: 1 });
    if (url.endsWith('/admin/courses/5/videos/order')) return response({ ok: true });
    if (url.endsWith('/admin/videos/3/courses')) return response({ video: reusable });
    if (url.endsWith('/admin/videos/1/courses/5')) return response({ deleted: true });
    return defaultFetch(input, options);
  });
  const user = userEvent.setup();
  renderAdmin('/admin/courses/5/content');

  expect(await screen.findByRole('heading', { name: 'Course content' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Upload and assign' })).toHaveAttribute('href', '/admin/videos/new?course=5');
  const firstRow = screen.getByText('First exam').closest('[draggable="true"]');
  expect(firstRow).toBeTruthy();
  expect(firstRow.querySelector('img')).toHaveAttribute('src', 'https://media.test/first.jpg');
  expect(within(firstRow).getByText(/2 min/)).toBeVisible();
  expect(within(firstRow).getByText('Free for everyone')).toHaveClass('chip');

  await user.click(screen.getByRole('button', { name: 'Move First exam down' }));
  await waitFor(() => {
    const call = fetch.mock.calls.find(([input]) => String(input).endsWith('/admin/courses/5/videos/order'));
    expect(requestBody(call)).toEqual({ video_ids: [2, 1] });
  });

  await user.type(screen.getByRole('searchbox', { name: 'Search reusable videos' }), 'Reusable');
  await user.click(await screen.findByRole('checkbox', { name: /Reusable exam/ }));
  await user.click(screen.getByRole('button', { name: 'Add selected videos' }));
  await waitFor(() => {
    const call = fetch.mock.calls.find(([input]) => String(input).endsWith('/admin/videos/3/courses'));
    expect(requestBody(call)).toEqual({ course_ids: [9, 5] });
  });

  await user.click(screen.getByRole('button', { name: 'Remove First exam from this course' }));
  await user.click(await screen.findByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(fetch.mock.calls.some(([input, options]) => (
    String(input).endsWith('/admin/videos/1/courses/5') && options.method === 'DELETE'
  ))).toBe(true));
});

it('guards rapid order changes and reloads the authoritative order after a rejected write', async () => {
  const initial = [
    { id: 1, title: 'First exam', access_type: 'free' },
    { id: 2, title: 'Second exam', access_type: 'free' },
  ];
  const orderWrite = deferred();
  let courseLoads = 0;
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/courses/5')) {
      courseLoads += 1;
      return response({ course: { id: 5, title: 'Equine course', videos: initial } });
    }
    if (url.endsWith('/admin/courses/5/videos/order') && options.method === 'PUT') return orderWrite.promise;
    if (url.includes('/admin/videos')) return response({ items: [], total: 0, page: 1 });
    return defaultFetch(input, options);
  });
  renderAdmin('/admin/courses/5/content');

  const moveDown = await screen.findByRole('button', { name: 'Move First exam down' });
  fireEvent.click(moveDown);
  fireEvent.click(moveDown);

  expect(moveDown).toBeDisabled();
  expect(fetch.mock.calls.filter(([input]) => String(input).endsWith('/admin/courses/5/videos/order'))).toHaveLength(1);
  orderWrite.resolve(await response({ error: 'catalog_validation_failed', errors: ['video_order_membership_mismatch'] }, 409));

  await waitFor(() => expect(courseLoads).toBe(2));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Move First exam down' })).toBeEnabled());
  const rows = document.querySelectorAll('.ordered-video-row');
  expect(within(rows[0]).getByText('First exam')).toBeVisible();
  expect(screen.getByText('The course order changed in another session. Reload it and try again.')).toBeVisible();
});

it('preserves a new course typed while instructor and category options load', async () => {
  const users = deferred();
  const categories = deferred();
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/users?role=instructor')) return users.promise;
    if (url.endsWith('/categories')) return categories.promise;
    return defaultFetch(input, options);
  });
  const user = userEvent.setup();
  renderAdmin('/admin/courses/new');

  await user.type(await screen.findByLabelText('Arabic title'), 'بيانات بطيئة');
  users.resolve(await response({ users: [{ id: 8, name: 'Dr Sara' }] }));
  categories.resolve(await response({ categories: fixedCategories }));

  await waitFor(() => expect(screen.getByLabelText('Instructor')).toHaveValue('8'));
  expect(screen.getByLabelText('Arabic title')).toHaveValue('بيانات بطيئة');
});

it('preserves a new bundle typed during slow loads and across a language change', async () => {
  const courses = deferred();
  const videos = deferred();
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.includes('/admin/courses')) return courses.promise;
    if (url.includes('/admin/videos')) return videos.promise;
    return defaultFetch(input, options);
  });
  const user = userEvent.setup();
  renderAdmin('/admin/bundles/new');

  await user.type(await screen.findByLabelText('Arabic title'), 'حزمة محفوظة');
  courses.resolve(await response({ courses: [], page: 1, pages: 1 }));
  videos.resolve(await response({ items: [], page: 1, pages: 1 }));
  await waitFor(() => expect(screen.getByText('Total list price')).toBeVisible());
  await user.click(screen.getByRole('button', { name: 'Arabic' }));

  expect(screen.getByDisplayValue('حزمة محفوظة')).toBeVisible();
});

it('keeps selected videos across searches, submits all, and reloads after a partial assignment failure', async () => {
  const first = { id: 3, title: 'First reusable', courses: [], access_type: 'free' };
  const second = { id: 4, title: 'Second reusable', courses: [], access_type: 'free' };
  let courseLoads = 0;
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.endsWith('/admin/courses/5')) {
      courseLoads += 1;
      return response({ course: { id: 5, title: 'Equine course', videos: courseLoads > 1 ? [first] : [] } });
    }
    if (url.includes('/admin/videos?') && (!options.method || options.method === 'GET')) {
      return response({ items: url.includes('q=Second') ? [second] : [first], total: 1, page: 1, pages: 1 });
    }
    if (url.endsWith('/admin/videos/3/courses')) return response({ video: first });
    if (url.endsWith('/admin/videos/4/courses')) return response({ error: 'assignment_failed' }, 500);
    return defaultFetch(input, options);
  });
  const user = userEvent.setup();
  renderAdmin('/admin/courses/5/content');

  await user.click(await screen.findByRole('checkbox', { name: /First reusable/ }));
  const search = screen.getByRole('searchbox', { name: 'Search reusable videos' });
  await user.type(search, 'Second');
  await user.click(await screen.findByRole('checkbox', { name: /Second reusable/ }));
  await user.click(screen.getByRole('button', { name: 'Add selected videos' }));

  await waitFor(() => expect(fetch.mock.calls.some(([input]) => String(input).endsWith('/admin/videos/3/courses'))).toBe(true));
  expect(fetch.mock.calls.some(([input]) => String(input).endsWith('/admin/videos/4/courses'))).toBe(true);
  await waitFor(() => expect(courseLoads).toBe(2));
  expect(await screen.findByText('First reusable')).toBeVisible();
  expect(screen.getByText('Unable to assign the selected videos.')).toBeVisible();
});

it('loads bounded second pages for bundle selectors and submits their English records', async () => {
  const secondPageCourse = {
    id: 101, title: 'دورة الصفحة الثانية', title_en: 'Second-page English course',
    price: 200, currency: 'EGP', access_type: 'general',
  };
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.includes('/admin/courses')) {
      return response(url.includes('page=2')
        ? { courses: [secondPageCourse], page: 2, pages: 2 }
        : { courses: [], page: 1, pages: 2 });
    }
    if (url.includes('/admin/videos')) return response({ items: [], page: 1, pages: 1 });
    if (url.endsWith('/admin/bundles') && options.method === 'POST') return response({ bundle: { id: 1 } }, 201);
    return defaultFetch(input, options);
  });
  const user = userEvent.setup();
  renderAdmin('/admin/bundles/new');

  await user.type(await screen.findByLabelText('Arabic title'), 'حزمة كبيرة');
  await user.click(await screen.findByRole('checkbox', { name: /Second-page English course/ }));
  await user.clear(screen.getByLabelText('Package price'));
  await user.type(screen.getByLabelText('Package price'), '100');
  await user.click(screen.getByRole('button', { name: 'Save bundle' }));

  const call = fetch.mock.calls.find(([input, options]) => String(input).endsWith('/admin/bundles') && options.method === 'POST');
  expect(requestBody(call)).toMatchObject({ course_ids: [101] });
});

it('builds a mixed package, totals list prices, warns about duplicate coverage, and shows compatibility errors', async () => {
  const course = { id: 3, title: 'Equine course', price: 200, currency: 'EGP', access_type: 'baytarian' };
  const video = { id: 9, title: 'Equine exam', price: 100, currency: 'EGP', access_type: 'baytarian', courses: [{ id: 3 }] };
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    const url = String(input);
    if (url.includes('/admin/courses')) return response({ courses: [course] });
    if (url.includes('/admin/videos')) return response({ items: [video], total: 1, page: 1 });
    if (url.endsWith('/admin/bundles') && options.method === 'POST') {
      return response({ error: 'catalog_validation_failed', errors: ['bundle_course_access_mismatch'] }, 422);
    }
    return defaultFetch(input, options);
  });
  const user = userEvent.setup();
  renderAdmin('/admin/bundles/new');

  expect(await screen.findByRole('heading', { name: 'New bundle' })).toBeVisible();
  await user.type(screen.getByLabelText('Arabic title'), 'حزمة الخيول');
  await user.click(await screen.findByRole('checkbox', { name: /Equine course/ }));
  await user.click(screen.getByRole('checkbox', { name: /Equine exam/ }));
  await user.selectOptions(screen.getByLabelText('Access type'), 'baytarian');
  await user.clear(screen.getByLabelText('Package price'));
  await user.type(screen.getByLabelText('Package price'), '250');

  expect(screen.getByText(/300 EGP/)).toBeVisible();
  expect(screen.getByText(/already included through Equine course/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save bundle' }));

  const call = fetch.mock.calls.find(([input, options]) => String(input).endsWith('/admin/bundles') && options.method === 'POST');
  expect(requestBody(call)).toMatchObject({ course_ids: [3], video_ids: [9], access_type: 'baytarian', price: 250 });
  expect(await screen.findByText('A selected course is not compatible with this package audience.')).toBeVisible();
});

it('orders the six fixed categories, edits bilingual labels, preserves slugs, and hides fixed delete actions', async () => {
  const categories = [
    fixedCategories[5], fixedCategories[1], { id: 12, slug: 'custom', name: 'مخصص', name_en: 'Custom' },
    fixedCategories[3], fixedCategories[0], fixedCategories[4], fixedCategories[2],
  ];
  const defaultFetch = fetch.getMockImplementation();
  fetch.mockImplementation((input, options = {}) => {
    if (String(input).endsWith('/categories')) return response({ categories });
    if (String(input).endsWith('/admin/categories/2') && options.method === 'PATCH') return response({ category: fixedCategories[1] });
    return defaultFetch(input, options);
  });
  const user = userEvent.setup();
  renderAdmin('/admin/categories');

  const table = await screen.findByRole('table');
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.slice(0, 6).map((row) => within(row).getAllByRole('cell')[1].textContent)).toEqual([
    'large-animals', 'equine', 'pet-animals', 'poultry', 'fish-other-animal-sources', 'camel',
  ]);
  expect(within(rows[1]).queryByRole('button', { name: 'Delete category' })).not.toBeInTheDocument();
  expect(within(rows[6]).getByRole('button', { name: 'Delete category' })).toBeVisible();

  await user.click(within(rows[1]).getByRole('button', { name: 'Edit category' }));
  expect(await screen.findByText('equine')).toBeVisible();
  const dialog = screen.getByRole('dialog', { name: 'Edit category' });
  const english = within(dialog).getByLabelText('English label');
  await user.clear(english);
  await user.type(english, 'Equine medicine');
  await user.click(within(dialog).getByRole('button', { name: 'Save category' }));

  const call = fetch.mock.calls.find(([input]) => String(input).endsWith('/admin/categories/2'));
  expect(requestBody(call)).toEqual({ name: 'الخيول', name_en: 'Equine medicine' });
});
