import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import CreditsPage from '../app/dashboard/credits/page';
import { renderWithQueryClient } from '../lib/test-utils';

function mockFetchByUrl(routes: Record<string, { body: unknown; status?: number }>) {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST' && url.includes('/payments') && !url.includes('estimate')) {
      const route = routes['POST /payments'];
      return Promise.resolve({
        status: route?.status ?? 200,
        ok: (route?.status ?? 200) < 400,
        json: async () => route?.body,
      });
    }
    const match = Object.entries(routes).find(
      ([path]) => !path.startsWith('POST') && url.includes(path),
    );
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return Promise.resolve({
      status: match[1].status ?? 200,
      ok: (match[1].status ?? 200) < 400,
      json: async () => match[1].body,
    });
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

const wallet = {
  id: 'w1',
  userId: 'u1',
  availableCredits: 100,
  lifetimePurchased: 100,
  lifetimeConsumed: 0,
  createdAt: '',
  updatedAt: '',
};

const packages = [
  {
    id: 'pkg-1',
    priceMt: 100,
    baseCredits: 200,
    bonusCredits: 0,
    totalCredits: 200,
    active: true,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'pkg-2',
    priceMt: 250,
    baseCredits: 450,
    bonusCredits: 100,
    totalCredits: 550,
    active: true,
    createdAt: '',
    updatedAt: '',
  },
];

describe('CreditsPage — purchase flow', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders every available package with its price and credit amount', async () => {
    mockFetchByUrl({
      '/credits': { body: { success: true, data: wallet } },
      '/credit-packages': { body: { success: true, data: packages } },
    });
    renderWithQueryClient(<CreditsPage />);

    expect(await screen.findByText('200')).toBeInTheDocument();
    expect(screen.getByText('100 MT')).toBeInTheDocument();
    expect(screen.getByText('550')).toBeInTheDocument();
    expect(screen.getByText('250 MT')).toBeInTheDocument();
    expect(screen.getByText(/Inclui 100 créditos de bónus/)).toBeInTheDocument();
  });

  it('shows a message when no packages are available', async () => {
    mockFetchByUrl({
      '/credits': { body: { success: true, data: wallet } },
      '/credit-packages': { body: { success: true, data: [] } },
    });
    renderWithQueryClient(<CreditsPage />);

    expect(
      await screen.findByText('Nenhum pacote de créditos disponível de momento.'),
    ).toBeInTheDocument();
  });

  it('clicking "Comprar" calls POST /payments with the correct packageId and provider MPESA', async () => {
    const mock = mockFetchByUrl({
      '/credits': { body: { success: true, data: wallet } },
      '/credit-packages': { body: { success: true, data: packages } },
      'POST /payments': { body: { success: true, data: { id: 'pay-1', status: 'PROCESSING' } } },
    });
    renderWithQueryClient(<CreditsPage />);
    await screen.findByText('200');

    const buttons = screen.getAllByRole('button', { name: 'Comprar' });
    fireEvent.click(buttons[0]!);

    await waitFor(() =>
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining('/payments'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ packageId: 'pkg-1', provider: 'MPESA' }),
        }),
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it("shows the backend's own error message when the payment cannot be started (e.g. provider not implemented yet)", async () => {
    mockFetchByUrl({
      '/credits': { body: { success: true, data: wallet } },
      '/credit-packages': { body: { success: true, data: packages } },
      'POST /payments': {
        body: {
          success: false,
          error: { code: 'NOT_IMPLEMENTED', message: 'M-Pesa integration is not implemented yet.' },
        },
        status: 501,
      },
    });
    renderWithQueryClient(<CreditsPage />);
    await screen.findByText('200');

    fireEvent.click(screen.getAllByRole('button', { name: 'Comprar' })[0]!);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('M-Pesa integration is not implemented yet.'),
    );
  });

  it('disables every purchase button while one purchase is in flight', async () => {
    mockFetchByUrl({
      '/credits': { body: { success: true, data: wallet } },
      '/credit-packages': { body: { success: true, data: packages } },
      'POST /payments': { body: { success: true, data: { id: 'pay-1', status: 'PROCESSING' } } },
    });
    renderWithQueryClient(<CreditsPage />);
    await screen.findByText('200');

    const buttons = screen.getAllByRole('button', { name: 'Comprar' });
    fireEvent.click(buttons[0]!);

    expect(buttons[1]).toBeDisabled();
  });
});
