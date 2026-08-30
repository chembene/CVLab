import { screen, waitFor } from '@testing-library/react';
import HomePage from '../app/page';
import { renderWithProviders } from '../lib/test-utils';

function mockFetchOnce(body: unknown, status = 200): void {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ status, json: async () => body }) as unknown as typeof fetch;
}

describe('HomePage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the CVLab AI heading and sign-in/sign-up links when logged out', async () => {
    mockFetchOnce({ success: false, error: { code: 'UNAUTHORIZED', message: 'No session.' } }, 401);
    renderWithProviders(<HomePage />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/oportunidade/i);
    await waitFor(() =>
      expect(screen.getAllByRole('link', { name: 'Entrar' })[0]).toBeInTheDocument(),
    );
    expect(screen.getAllByRole('link', { name: 'Criar conta' })[0]).toBeInTheDocument();
  });

  it('shows a link to the dashboard once the session is restored', async () => {
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
    renderWithProviders(<HomePage />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /ir para o painel/i })).toBeInTheDocument(),
    );
  });
});
