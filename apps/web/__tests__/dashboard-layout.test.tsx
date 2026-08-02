import { render, screen, waitFor } from '@testing-library/react';
import DashboardLayout from '../app/dashboard/layout';
import { AuthProvider } from '../lib/auth-context';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
}));

function mockFetchOnce(body: unknown, status = 200): void {
  global.fetch = jest
    .fn()
    .mockResolvedValue({ status, json: async () => body }) as unknown as typeof fetch;
}

describe('DashboardLayout', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    replace.mockClear();
  });

  it('redirects to /login when there is no active session', async () => {
    mockFetchOnce({ success: false, error: { code: 'UNAUTHORIZED', message: 'No session.' } }, 401);
    render(
      <AuthProvider>
        <DashboardLayout>
          <p>conteúdo protegido</p>
        </DashboardLayout>
      </AuthProvider>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('renders the nav and children once authenticated', async () => {
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
        <DashboardLayout>
          <p>conteúdo protegido</p>
        </DashboardLayout>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Perfil' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Currículo' })).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
