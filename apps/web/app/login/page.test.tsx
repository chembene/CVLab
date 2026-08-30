import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import LoginPage from './page';
import { renderWithProviders } from '@/lib/test-utils';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
}));

/** AuthProvider fires POST /auth/refresh on mount — every sequence accounts for that as call #1. */
const AUTH_REFRESH_NO_SESSION = {
  body: { success: false, error: { code: 'UNAUTHORIZED', message: 'No session.' } },
  status: 401,
};

function mockFetchSequence(bodies: { body: unknown; status?: number }[]): jest.Mock {
  const mock = jest.fn();
  for (const { body, status = 200 } of [AUTH_REFRESH_NO_SESSION, ...bodies]) {
    mock.mockResolvedValueOnce({ status, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('LoginPage form validation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    push.mockClear();
  });

  it('shows a validation error and never calls the API when the e-mail is empty', async () => {
    const mock = mockFetchSequence([]);
    renderWithProviders(<LoginPage />);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(1)); // only the initial /auth/refresh

    fireEvent.change(screen.getByLabelText('Palavra-passe'), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });

    expect(await screen.findByText('O e-mail é obrigatório.')).toBeInTheDocument();
    expect(mock).toHaveBeenCalledTimes(1); // still just the refresh call — no login POST
  });

  it('shows a validation error for an invalid e-mail format', async () => {
    mockFetchSequence([]);
    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Palavra-passe'), { target: { value: 'x' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });

    expect(await screen.findByText('Introduza um e-mail válido.')).toBeInTheDocument();
  });

  it('submits and redirects to the dashboard on valid credentials', async () => {
    mockFetchSequence([
      {
        body: {
          success: true,
          data: {
            user: { id: 'u1', email: 'user@example.com', role: 'USER', status: 'ACTIVE' },
            accessToken: 'tok',
          },
        },
      },
    ]);
    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Palavra-passe'), { target: { value: 'Sup3rSecret1' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(toast.success).toHaveBeenCalledWith('Sessão iniciada com sucesso.');
  });

  it('shows the server error message when login fails', async () => {
    mockFetchSequence([
      {
        body: {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Credenciais inválidas.' },
        },
        status: 401,
      },
    ]);
    renderWithProviders(<LoginPage />);

    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'user@example.com' } });
    fireEvent.change(screen.getByLabelText('Palavra-passe'), {
      target: { value: 'wrong-password' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    });

    expect(await screen.findByText('Credenciais inválidas.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
