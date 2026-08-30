import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import AtsReportDetailPage from '../app/dashboard/ats-reports/[id]/page';
import { renderWithQueryClient } from '../lib/test-utils';
import type { AtsReport } from '../lib/api/ats';
import type { AtsAiAnalysis } from '../lib/api/ats-ai';
import type { CreditEstimate } from '../lib/api/career-advisor';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'report-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));

function mockFetchByRoute(routes: {
  report: unknown;
  estimate: unknown;
  aiAnalyses: unknown;
  submit?: { body: unknown; status?: number };
}): jest.Mock {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes('/credits/estimate')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.estimate }),
      });
    }
    if (url.includes('/ats-ai/analyze') && init?.method === 'POST') {
      return Promise.resolve({
        status: routes.submit?.status ?? 200,
        json: async () => routes.submit?.body,
      });
    }
    if (url.includes('/ats-ai/analyses')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.aiAnalyses }),
      });
    }
    if (url.includes('/ats/reports/report-1')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.report }),
      });
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

function makeReport(overrides: Partial<AtsReport> = {}): AtsReport {
  return {
    id: 'report-1',
    userId: 'user-1',
    resumeVariantId: 'variant-1',
    jobTargetId: 'jt-1',
    overallScore: 62,
    keywordScore: 55,
    skillsScore: 70,
    experienceScore: 60,
    educationScore: 80,
    languageScore: 90,
    formattingScore: 65,
    completionScore: 75,
    matchedKeywords: ['TypeScript'],
    missingKeywords: ['Kubernetes'],
    recommendedSkills: ['Docker'],
    recommendations: ['Add more quantified achievements.'],
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

function makeEstimate(overrides: Partial<CreditEstimate> = {}): CreditEstimate {
  return {
    featureKey: 'ats_ai',
    cost: 30,
    currentBalance: 100,
    sufficientBalance: true,
    balanceAfter: 70,
    ...overrides,
  };
}

function makeAnalysis(overrides: Partial<AtsAiAnalysis> = {}): AtsAiAnalysis {
  return {
    id: 'analysis-1',
    userId: 'user-1',
    atsReportId: 'report-1',
    overallAssessment: 'This résumé is a moderate match for the role.',
    strengths: ['Strong TypeScript experience'],
    priorityIssues: [
      {
        priority: 'HIGH' as never,
        category: 'Keywords',
        explanation: 'Kubernetes is required but missing.',
        recommendation: 'Add Kubernetes to your skills section.',
      },
    ],
    contentRecommendations: [],
    sectionRecommendations: [],
    actionPlan: ['Add the missing Kubernetes keyword.'],
    contextSnapshot: {
      matchedKeywordsCount: 1,
      missingKeywordsCount: 1,
      recommendedSkillsCount: 1,
    },
    creditsUsed: 30,
    aiRequestId: 'ai-req-1',
    createdAt: '2026-08-30T10:05:00.000Z',
    ...overrides,
  };
}

describe('AtsReportDetailPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the deterministic ATS report (scores, matched/missing keywords)', async () => {
    mockFetchByRoute({ report: makeReport(), estimate: makeEstimate(), aiAnalyses: [] });
    renderWithQueryClient(<AtsReportDetailPage />);

    expect(await screen.findByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('Kubernetes')).toBeInTheDocument();
    expect(screen.getByText('Docker')).toBeInTheDocument();
    expect(screen.getByText('Add more quantified achievements.')).toBeInTheDocument();
  });

  it('shows an empty state and the AI button with dynamic price when no AI interpretation exists yet', async () => {
    mockFetchByRoute({ report: makeReport(), estimate: makeEstimate(), aiAnalyses: [] });
    renderWithQueryClient(<AtsReportDetailPage />);

    expect(await screen.findByText('Ainda sem interpretação de IA')).toBeInTheDocument();
    expect(screen.getByText('Custo: 30 créditos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Analisar com IA/ })).toBeInTheDocument();
  });

  it('disables the AI button and shows a warning when the balance is insufficient', async () => {
    mockFetchByRoute({
      report: makeReport(),
      estimate: makeEstimate({ sufficientBalance: false, currentBalance: 5 }),
      aiAnalyses: [],
    });
    renderWithQueryClient(<AtsReportDetailPage />);

    await screen.findByText(/Saldo insuficiente/);
    expect(screen.getByRole('button', { name: /Analisar com IA/ })).toBeDisabled();
  });

  it('renders an existing AI interpretation — overall assessment, strengths, priority issues, action plan', async () => {
    mockFetchByRoute({
      report: makeReport(),
      estimate: makeEstimate(),
      aiAnalyses: [makeAnalysis()],
    });
    renderWithQueryClient(<AtsReportDetailPage />);

    expect(
      await screen.findByText('This résumé is a moderate match for the role.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Strong TypeScript experience/)).toBeInTheDocument();
    expect(screen.getByText('Kubernetes is required but missing.')).toBeInTheDocument();
    expect(screen.getByText('Add Kubernetes to your skills section.')).toBeInTheDocument();
    expect(screen.getByText(/Add the missing Kubernetes keyword/)).toBeInTheDocument();
    // No "generate" button/prompt once a result already exists.
    expect(screen.queryByRole('button', { name: /Analisar com IA/ })).not.toBeInTheDocument();
  });

  it('only shows the analysis belonging to this report, ignoring others', async () => {
    mockFetchByRoute({
      report: makeReport(),
      estimate: makeEstimate(),
      aiAnalyses: [
        makeAnalysis({ id: 'other', atsReportId: 'other-report', overallAssessment: 'Unrelated.' }),
      ],
    });
    renderWithQueryClient(<AtsReportDetailPage />);

    expect(await screen.findByText('Ainda sem interpretação de IA')).toBeInTheDocument();
    expect(screen.queryByText('Unrelated.')).not.toBeInTheDocument();
  });

  it('generates an AI interpretation on click and renders the result', async () => {
    const analysis = makeAnalysis();
    const mock = mockFetchByRoute({
      report: makeReport(),
      estimate: makeEstimate(),
      aiAnalyses: [],
      submit: { body: { success: true, data: analysis } },
    });
    renderWithQueryClient(<AtsReportDetailPage />);
    await screen.findByRole('button', { name: /Analisar com IA/ });

    fireEvent.click(screen.getByRole('button', { name: /Analisar com IA/ }));

    await waitFor(() => {
      const submitCall = mock.mock.calls.find(
        ([url, init]) =>
          (url as string).includes('/ats-ai/analyze') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(submitCall).toBeDefined();
      const [, init] = submitCall as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({ atsReportId: 'report-1' });
    });

    expect(
      await screen.findByText('This résumé is a moderate match for the role.'),
    ).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Interpretação de IA gerada.');
  });

  it('shows an error toast when generation fails', async () => {
    mockFetchByRoute({
      report: makeReport(),
      estimate: makeEstimate(),
      aiAnalyses: [],
      submit: {
        body: { success: false, error: { message: 'Falha na análise.', code: 'AI_ERROR' } },
        status: 500,
      },
    });
    renderWithQueryClient(<AtsReportDetailPage />);
    await screen.findByRole('button', { name: /Analisar com IA/ });

    fireEvent.click(screen.getByRole('button', { name: /Analisar com IA/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Falha na análise.');
    });
  });
});
