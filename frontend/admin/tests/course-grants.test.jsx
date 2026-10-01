/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import CourseGrantDialog from '../src/components/CourseGrantDialog.jsx';
import { LanguageProvider } from '../src/i18n.jsx';
import { setToken } from '../src/api.js';

function json(data, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

const students = [
  { id: 7, name: 'Dr Sara', email: 'sara@example.test', is_baytarian: true },
  { id: 8, name: 'Omar', email: 'omar@example.test', is_baytarian: false },
];

let grants;
let answer;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('baytara_admin_language', 'en');
  setToken('test-token');
  grants = [];
  answer = (ids) => ({ granted: ids.map((id) => ({ user_id: id })), skipped: [], enrolled_count: ids.length });
  vi.stubGlobal('fetch', vi.fn((input, init = {}) => {
    const url = String(input);
    if (url.includes('/admin/courses/13/grants')) {
      const body = JSON.parse(init.body);
      grants.push(body);
      return json(answer(body.user_ids));
    }
    if (url.includes('/admin/users')) return json({ users: students });
    return json({});
  }));
});

afterEach(() => {
  cleanup();
  setToken('');
  vi.unstubAllGlobals();
});

const course = { id: 13, title: 'Ultrasound', access_days: 180 };

it('picks several people and grants them the course in one call', async () => {
  const user = userEvent.setup();
  const onDone = vi.fn();
  const onClose = vi.fn();
  render(<LanguageProvider><CourseGrantDialog course={course} onClose={onClose} onDone={onDone} /></LanguageProvider>);

  const adds = await screen.findAllByRole('button', { name: 'Add' });
  await user.click(adds[0]);
  await user.click(adds[1]);
  expect(screen.getByText('Selected (2)')).toBeVisible();
  // an added person is not offered twice
  expect(screen.getAllByRole('button', { name: 'Added' })).toHaveLength(2);

  await user.click(screen.getByRole('button', { name: 'Remove Omar' }));
  await user.click(screen.getAllByRole('button', { name: 'Add' })[0]);
  await user.selectOptions(screen.getByRole('combobox'), 'lifetime');
  await user.click(screen.getByRole('button', { name: 'Grant access to 2' }));

  expect(grants).toEqual([{ user_ids: [7, 8], access: 'lifetime' }]);
  expect(onDone).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});

it('says who was skipped and why instead of claiming everyone got in', async () => {
  answer = () => ({
    granted: [{ user_id: 7 }],
    skipped: [{ user_id: 8, name: 'Omar', email: 'omar@example.test', reason: 'needs_baytarian' }],
    enrolled_count: 1,
  });
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(<LanguageProvider><CourseGrantDialog course={course} onClose={onClose} onDone={() => {}} /></LanguageProvider>);

  for (const add of await screen.findAllByRole('button', { name: 'Add' })) await user.click(add);
  await user.click(screen.getByRole('button', { name: 'Grant access to 2' }));

  expect(await screen.findByText('Not granted:')).toBeVisible();
  expect(screen.getByText(/Omar \(omar@example.test\): not a verified vet/)).toBeVisible();
  expect(onClose).not.toHaveBeenCalled();
});
