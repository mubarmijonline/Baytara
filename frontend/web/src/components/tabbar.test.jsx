/* @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import TabBar from './TabBar.jsx';
import { AuthProvider } from '../lib/auth.jsx';
import { clearPublicCache, setToken } from '../lib/api.js';
import { I18nProvider } from '../lib/i18n.jsx';

function renderBar() {
  return render(
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider><TabBar /></AuthProvider>
      </I18nProvider>
    </BrowserRouter>,
  );
}

beforeEach(() => {
  clearPublicCache();
  localStorage.clear();
  localStorage.setItem('baytara_lang', 'en');
});
afterEach(cleanup);

it('offers a way in, not a dashboard, when nobody is signed in', () => {
  renderBar();
  const tab = screen.getByRole('link', { name: 'Sign in' });
  expect(tab).toHaveAttribute('href', '/auth');
  expect(screen.queryByRole('link', { name: 'My learning' })).not.toBeInTheDocument();
});

it('shows the dashboard once a session exists', () => {
  setToken('student-token');
  renderBar();
  const tab = screen.getByRole('link', { name: 'My learning' });
  expect(tab).toHaveAttribute('href', '/dashboard');
  expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
});
