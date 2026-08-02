import { render, screen, waitFor } from '@testing-library/react';
import HomePage from '../app/page';
import { AuthProvider } from '../lib/auth-context';

function mockFetchOnce(body: unknown, status = 200): void {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ status, json: async () => body }) as unknown as typeof fetch;
}

describe('HomePage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the CVLab AI heading', async () => {
    mockFetchOnce({ success: false, error: { code: 'UNAUTHORIZED', message: 'No session.' } }, 401);
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );
    expect(screen.getByRole('heading', { level: 1, name: /cvlab ai/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Ainda não iniciou sessão.')).toBeInTheDocument());
  });

  it('shows the logged-in state once the session is restored', async () => {
    mockFetchOnce({
      success: true,
      data: {
        user: {
          id: 'u1',
          email: 'user@example.com',
          role: 'USER',
          status: 'ACTIVE',
          createdAt: '2026-01-01',
        },
        accessToken: 'token',
      },
    });
    render(
      <AuthProvider>
        <HomePage />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText(/user@example.com/)).toBeInTheDocument());
  });
});
