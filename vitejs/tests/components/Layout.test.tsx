import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/auth', () => ({
  getUserInfo: vi.fn(() => ({ name: 'TestUser', email: 'test@example.com' })),
  logout: vi.fn(),
}));

// Mock api module to prevent real fetch calls for token balance
vi.mock('../../src/api', () => ({
  api: {
    tokenBalance: vi.fn(() =>
      Promise.reject(new Error('not configured in test')),
    ),
  },
}));

import { logout } from '../../src/auth';
import { Layout } from '../../src/components/Layout';

function renderLayout(initialRoute = '/') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Layout />
    </MemoryRouter>,
  );
}

describe('Layout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders Chat nav link', () => {
    renderLayout();
    expect(screen.getAllByText('Chat').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Ledger nav link', () => {
    renderLayout();
    expect(screen.getAllByText('Ledger').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Documents nav link', () => {
    renderLayout();
    expect(screen.getAllByText('Documents').length).toBeGreaterThanOrEqual(1);
  });

  it('renders Settings nav link', () => {
    renderLayout();
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });

  it('renders user info', () => {
    renderLayout();
    expect(screen.getByText('TestUser')).toBeInTheDocument();
  });

  it('renders logout button', async () => {
    const user = userEvent.setup();
    renderLayout();
    const logoutBtn = screen.getByRole('button', { name: /log out/i });
    await user.click(logoutBtn);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('renders app branding', () => {
    renderLayout();
    expect(screen.getAllByText('🤖 MyBuddy').length).toBeGreaterThanOrEqual(1);
  });

  it('renders mobile menu toggle button', () => {
    renderLayout();
    const menuBtn = screen.getByRole('button', { name: /toggle menu/i });
    expect(menuBtn).toBeInTheDocument();
  });

  it('brand subtitle is shown', () => {
    renderLayout();
    expect(screen.getByText('Your AI Assistant')).toBeInTheDocument();
  });
});
