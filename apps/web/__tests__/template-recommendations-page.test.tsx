import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import TemplateRecommendationsPage from '../app/dashboard/template-recommendations/page';
import { renderWithQueryClient } from '../lib/test-utils';
import { ALL_NAV_ITEMS } from '../lib/nav-items';
import type { TemplateRecommendation } from '../lib/api/template-recommendations';
import type { CreditEstimate } from '../lib/api/career-advisor';
import type { TemplateMetadata } from '../lib/api/templates';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

function makeTemplate(overrides: Partial<TemplateMetadata> = {}): TemplateMetadata {
  return {
    id: 'tpl-1',
    name: 'ATS Classic',
    category: 'ATS_CLASSIC',
    isATSFriendly: true,
    premium: false,
    version: 1,
    primaryColor: '#111827',
    secondaryColor: '#6B7280',
    font: 'Inter',
    layout: 'single-column',
    supportedSections: ['summary'],
    status: 'ACTIVE',
    ...overrides,
  };
}

function makeEstimate(overrides: Partial<CreditEstimate> = {}): CreditEstimate {
  return {
    featureKey: 'template_recommendation',
    cost: 20,
    currentBalance: 100,
    sufficientBalance: true,
    balanceAfter: 80,
    ...overrides,
  };
}

function makeRecommendation(
  overrides: Partial<TemplateRecommendation> = {},
): TemplateRecommendation {
  return {
    id: 'rec-1',
    userId: 'user-1',
    resumeVariantId: null,
    jobTargetId: null,
    summary: 'These templates suit a senior backend profile.',
    recommendations: [
      {
        templateId: 'tpl-1',
        rank: 1,
        score: 88,
        reason: 'ATS-friendly and safe for this seniority.',
      },
    ],
    contextSnapshot: {
      hasMasterResume: true,
      hasResumeVariant: false,
      hasJobTarget: false,
      workExperienceCount: 1,
      educationCount: 0,
      skillsCount: 2,
      availableTemplatesCount: 10,
    },
    creditsUsed: 20,
    aiRequestId: 'ai-req-1',
    createdAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

function mockFetchByRoute(routes: {
  estimate: unknown;
  jobTargets?: unknown;
  history: unknown;
  template?: unknown;
  resumeVariants?: unknown;
  submit?: { body: unknown; status?: number };
}): jest.Mock {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes('/credits/estimate')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.estimate }),
      });
    }
    if (url.includes('/job-targets')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.jobTargets ?? [] }),
      });
    }
    if (url.includes('/resume-variants')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.resumeVariants ?? [] }),
      });
    }
    if (url.match(/\/templates\/resume\/[^/]+$/)) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.template }),
      });
    }
    if (url.includes('/template-recommendations') && init?.method === 'POST') {
      return Promise.resolve({
        status: routes.submit?.status ?? 200,
        json: async () => routes.submit?.body,
      });
    }
    if (url.includes('/template-recommendations')) {
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

describe('TemplateRecommendationsPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows loading skeletons for the history section while queries are in flight', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderWithQueryClient(<TemplateRecommendationsPage />);
    expect(screen.getByText('Histórico de recomendações')).toBeInTheDocument();
  });

  it('shows the credit cost once the estimate loads', async () => {
    mockFetchByRoute({ estimate: makeEstimate(), history: [] });
    renderWithQueryClient(<TemplateRecommendationsPage />);
    expect(await screen.findByText('Custo: 20 créditos')).toBeInTheDocument();
  });

  it('renders an empty state when there is no recommendation history yet', async () => {
    mockFetchByRoute({ estimate: makeEstimate(), history: [] });
    renderWithQueryClient(<TemplateRecommendationsPage />);
    expect(await screen.findByText('Ainda sem recomendações')).toBeInTheDocument();
  });

  it('disables the generate button and shows a warning when the balance is insufficient', async () => {
    mockFetchByRoute({
      estimate: makeEstimate({ sufficientBalance: false, currentBalance: 5 }),
      history: [],
    });
    renderWithQueryClient(<TemplateRecommendationsPage />);

    await screen.findByText(/Saldo insuficiente/);
    expect(screen.getByRole('button', { name: /Gerar recomendação/ })).toBeDisabled();
  });

  it('renders prior recommendations in the history list', async () => {
    mockFetchByRoute({ estimate: makeEstimate(), history: [makeRecommendation()] });
    renderWithQueryClient(<TemplateRecommendationsPage />);

    expect(await screen.findByText('1 template(s) recomendado(s)')).toBeInTheDocument();
    expect(screen.getByText('These templates suit a senior backend profile.')).toBeInTheDocument();
  });

  it('generates a recommendation and renders the recommended template with rank/score/reason', async () => {
    const recommendation = makeRecommendation();
    const mock = mockFetchByRoute({
      estimate: makeEstimate(),
      history: [],
      template: makeTemplate(),
      submit: { body: { success: true, data: recommendation } },
    });
    renderWithQueryClient(<TemplateRecommendationsPage />);
    await screen.findByText('Custo: 20 créditos');

    fireEvent.click(screen.getByRole('button', { name: /Gerar recomendação/ }));

    await waitFor(() => {
      const submitCall = mock.mock.calls.find(
        ([url, init]) =>
          (url as string).includes('/template-recommendations') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(submitCall).toBeDefined();
      const [, init] = submitCall as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        resumeVariantId: undefined,
        jobTargetId: undefined,
      });
    });

    expect(
      await screen.findByText('These templates suit a senior backend profile.'),
    ).toBeInTheDocument();
    expect(await screen.findByText('ATS Classic')).toBeInTheDocument();
    expect(screen.getByText(/ATS-friendly and safe for this seniority/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ver este template/ })).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Recomendação de templates gerada.');
  });

  it('shows an error toast when generation fails', async () => {
    mockFetchByRoute({
      estimate: makeEstimate(),
      history: [],
      submit: {
        body: { success: false, error: { message: 'Falha na recomendação.', code: 'AI_ERROR' } },
        status: 500,
      },
    });
    renderWithQueryClient(<TemplateRecommendationsPage />);
    await screen.findByText('Custo: 20 créditos');

    fireEvent.click(screen.getByRole('button', { name: /Gerar recomendação/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Falha na recomendação.');
    });
  });
});

describe('Template Recommendation navigation entry', () => {
  it('is registered in the sidebar/mobile nav item list', () => {
    const entry = ALL_NAV_ITEMS.find((item) => item.href === '/dashboard/template-recommendations');
    expect(entry).toBeDefined();
    expect(entry?.label).toBe('Recomendação de Templates');
  });
});
