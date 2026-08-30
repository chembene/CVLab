import { screen, waitFor } from '@testing-library/react';
import DashboardLayout from '../app/dashboard/layout';
import { renderWithProviders } from '../lib/test-utils';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/dashboard',
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
    renderWithProviders(
      <DashboardLayout>
        <p>conteúdo protegido</p>
      </DashboardLayout>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('renders the sidebar navigation and children once authenticated', async () => {
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
    renderWithProviders(
      <DashboardLayout>
        <p>conteúdo protegido</p>
      </DashboardLayout>,
    );
    await waitFor(() => expect(screen.getByText('conteúdo protegido')).toBeInTheDocument());
    expect(screen.getAllByRole('link', { name: 'Perfil' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Currículo Principal' })[0]).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Versões do Currículo' })[0]).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });
});
