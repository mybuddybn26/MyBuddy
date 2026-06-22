import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth', () => ({
  initAuth: vi.fn(),
  getUserInfo: vi.fn(() => ({ name: 'TestUser', email: 'test@example.com' })),
  logout: vi.fn(),
}));

// Mock api to prevent fetch calls
vi.mock('../src/api', () => ({
  api: {
    tokenBalance: vi.fn(() =>
      Promise.reject(new Error('not configured in test')),
    ),
    chatHistory: vi.fn(() => Promise.resolve({ data: [] })),
    budgets: vi.fn(() => Promise.resolve({ data: [], count: 0 })),
  },
}));

import { initAuth } from '../src/auth';
import { App } from '../src/App';

const mockInitAuth = vi.mocked(initAuth);

describe('App', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('renders the Login page when unauthenticated', async () => {
    mockInitAuth.mockResolvedValue(false);
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'MyBuddy' }),
    ).toBeInTheDocument();
  });

  it('renders the Layout when authenticated', async () => {
    mockInitAuth.mockResolvedValue(true);
    render(<App />);
    const headings = await screen.findAllByText('🤖 MyBuddy');
    expect(headings.length).toBeGreaterThanOrEqual(1);
  });
});
