import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import LinkedInPage from '../app/dashboard/linkedin/page';
import { renderWithQueryClient } from '../lib/test-utils';
import { ALL_NAV_ITEMS } from '../lib/nav-items';
import type { LinkedInProfile } from '../lib/api/linkedin';
import type { CreditEstimate } from '../lib/api/career-advisor';

function mockFetchSequence(bodies: { body: unknown; status?: number }[]): jest.Mock {
  const mock = jest.fn();
  for (const { body, status = 200 } of bodies) {
    mock.mockResolvedValueOnce({ status, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

/**
 * Unlike mockFetchSequence, routes each call by URL/method instead of a
 * fixed queue order — needed once a mutation's onSuccess invalidates
 * multiple query keys (estimate + history here), whose resulting refetches
 * race each other and are not guaranteed to fire in a fixed order. Mirrors
 * career-advisor-page.test.tsx's identical helper (FASE 18).
 */
function mockFetchByRoute(routes: {
  estimate: unknown;
  history: unknown;
  submit: { body: unknown; status?: number };
}): jest.Mock {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes('/credits/estimate')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.estimate }),
      });
    }
    if (url.includes('/linkedin/profile') && init?.method === 'POST') {
      return Promise.resolve({
        status: routes.submit.status ?? 200,
        json: async () => routes.submit.body,
      });
    }
    if (url.includes('/linkedin/profile')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.history }),
      });
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function makeEstimate(overrides: Partial<CreditEstimate> = {}): CreditEstimate {
  return {
    featureKey: 'linkedin',
    cost: 30,
    currentBalance: 100,
    sufficientBalance: true,
    balanceAfter: 70,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<LinkedInProfile> = {}): LinkedInProfile {
  return {
    id: 'lp-1',
    userId: 'user-1',
    targetRole: 'Staff Engineer',
    headline: 'Senior Backend Engineer | TypeScript & Distributed Systems',
    about: 'Backend engineer with 6+ years of experience building scalable APIs.',
    skills: ['TypeScript', 'Node.js'],
    experienceSuggestions: ['Led backend team, cutting latency by 40%.'],
    recommendations: ['Add a profile photo to improve visibility.'],
    contextSnapshot: {
      hasProfile: true,
      hasMasterResume: true,
      workExperienceCount: 1,
      educationCount: 0,
      skillsCount: 2,
      jobTargetsCount: 0,
    },
    creditsUsed: 30,
    aiRequestId: 'ai-req-1',
    createdAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

describe('LinkedInPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows loading skeletons for the history section while queries are in flight', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderWithQueryClient(<LinkedInPage />);
    expect(screen.getByText('Histórico de perfis gerados')).toBeInTheDocument();
  });

  it('shows the credit cost once the estimate loads', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [] } },
    ]);
    renderWithQueryClient(<LinkedInPage />);
    expect(await screen.findByText('Custo: 30 créditos')).toBeInTheDocument();
  });

  it('renders an empty state when there is no profile history yet', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [] } },
    ]);
    renderWithQueryClient(<LinkedInPage />);
    expect(await screen.findByText('Ainda sem perfis gerados')).toBeInTheDocument();
  });

  it('renders prior profiles in the history list', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [makeProfile()] } },
    ]);
    renderWithQueryClient(<LinkedInPage />);
    expect(await screen.findByText('Staff Engineer')).toBeInTheDocument();
    expect(
      screen.getByText('Senior Backend Engineer | TypeScript & Distributed Systems'),
    ).toBeInTheDocument();
  });

  it('disables the generate button and shows a warning when the balance is insufficient', async () => {
    mockFetchSequence([
      {
        body: {
          success: true,
          data: makeEstimate({ sufficientBalance: false, currentBalance: 5 }),
        },
      },
      { body: { success: true, data: [] } },
    ]);
    renderWithQueryClient(<LinkedInPage />);

    await screen.findByText(/Saldo insuficiente/);
    expect(screen.getByRole('button', { name: /Gerar perfil/ })).toBeDisabled();
  });

  it('generates a profile with no target role given and renders headline/About/skills', async () => {
    const profile = makeProfile({ targetRole: null });
    const mock = mockFetchByRoute({
      estimate: makeEstimate(),
      history: [],
      submit: { body: { success: true, data: profile } },
    });
    renderWithQueryClient(<LinkedInPage />);
    await screen.findByText('Custo: 30 créditos');

    fireEvent.click(screen.getByRole('button', { name: /Gerar perfil/ }));

    await waitFor(() => {
      const submitCall = mock.mock.calls.find(
        ([url, init]) =>
          (url as string).includes('/linkedin/profile') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(submitCall).toBeDefined();
      const [, init] = submitCall as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({});
    });

    expect(await screen.findByText(profile.headline)).toBeInTheDocument();
    expect(screen.getByText(profile.about)).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText(/Led backend team, cutting latency by 40%/)).toBeInTheDocument();
    expect(screen.getByText(/Add a profile photo/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Perfil LinkedIn gerado.');
  });

  it('sends the entered target role in the request body', async () => {
    const profile = makeProfile();
    const mock = mockFetchByRoute({
      estimate: makeEstimate(),
      history: [],
      submit: { body: { success: true, data: profile } },
    });
    renderWithQueryClient(<LinkedInPage />);
    await screen.findByText('Custo: 30 créditos');

    fireEvent.change(screen.getByLabelText('Cargo-alvo (opcional)'), {
      target: { value: 'Staff Engineer' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Gerar perfil/ }));

    await waitFor(() => {
      const submitCall = mock.mock.calls.find(
        ([url, init]) =>
          (url as string).includes('/linkedin/profile') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      const [, init] = submitCall as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ targetRole: 'Staff Engineer' });
    });
  });

  it('shows an error toast when the request fails', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [] } },
      {
        body: { success: false, error: { message: 'Falha ao gerar perfil.', code: 'AI_ERROR' } },
        status: 500,
      },
    ]);
    renderWithQueryClient(<LinkedInPage />);
    await screen.findByText('Custo: 30 créditos');

    fireEvent.click(screen.getByRole('button', { name: /Gerar perfil/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Falha ao gerar perfil.');
    });
  });
});

describe('LinkedIn navigation entry', () => {
  it('is registered in the sidebar/mobile nav item list', () => {
    const entry = ALL_NAV_ITEMS.find((item) => item.href === '/dashboard/linkedin');
    expect(entry).toBeDefined();
    expect(entry?.label).toBe('Perfil LinkedIn');
  });
});
