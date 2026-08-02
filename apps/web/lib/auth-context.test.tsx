import { act, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useAuth } from './auth-context';

function mockFetchOnce(body: unknown, status = 200): void {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ status, json: async () => body }) as unknown as typeof fetch;
}

const safeUser = {
  id: 'u1',
  email: 'user@example.com',
  role: 'USER',
  status: 'ACTIVE',
  createdAt: '2026-01-01',
};

function Consumer() {
  const { user, isLoading, login, logout, register } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="user">{user?.email ?? 'none'}</span>
      <button onClick={() => login('user@example.com', 'password123')}>login</button>
      <button onClick={() => register('user@example.com', 'password123')}>register</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe('AuthProvider', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('restores no session when /auth/refresh rejects on mount', async () => {
    mockFetchOnce({ success: false, error: { code: 'UNAUTHORIZED', message: 'No session.' } }, 401);
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('restores the session when /auth/refresh succeeds on mount', async () => {
    mockFetchOnce({ success: true, data: { user: safeUser, accessToken: 'access-token' } });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('user@example.com'));
  });

  it('sets the user after a successful login', async () => {
    mockFetchOnce({ success: false, error: { code: 'UNAUTHORIZED', message: 'No session.' } }, 401);
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));

    mockFetchOnce({ success: true, data: { user: safeUser, accessToken: 'access-token' } });
    await act(async () => {
      screen.getByText('login').click();
    });
    expect(screen.getByTestId('user').textContent).toBe('user@example.com');
  });

  it('clears the user after logout even if the server call fails', async () => {
    mockFetchOnce({ success: true, data: { user: safeUser, accessToken: 'access-token' } });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('user@example.com'));

    mockFetchOnce({ success: false, error: { code: 'INTERNAL', message: 'boom' } }, 500);
    await act(async () => {
      screen.getByText('logout').click();
    });
    expect(screen.getByTestId('user').textContent).toBe('none');
  });
});
