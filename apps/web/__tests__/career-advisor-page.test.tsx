import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import CareerAdvisorPage from '../app/dashboard/career-advisor/page';
import { renderWithQueryClient } from '../lib/test-utils';
import type { CareerAdvice, CreditEstimate } from '../lib/api/career-advisor';

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
 * race each other and are not guaranteed to fire in a fixed order.
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
    if (url.includes('/career-advisor/advice') && init?.method === 'POST') {
      return Promise.resolve({
        status: routes.submit.status ?? 200,
        json: async () => routes.submit.body,
      });
    }
    if (url.includes('/career-advisor/advice')) {
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
    featureKey: 'career_advisor',
    cost: 30,
    currentBalance: 100,
    sufficientBalance: true,
    balanceAfter: 70,
    ...overrides,
  };
}

function makeAdvice(overrides: Partial<CareerAdvice> = {}): CareerAdvice {
  return {
    id: 'ca-1',
    userId: 'user-1',
    question: 'What should I focus on next?',
    summary: 'Focus on closing your leadership gap.',
    currentAssessment: 'You have solid technical fundamentals.',
    strengths: ['Strong TypeScript skills'],
    gaps: ['No leadership experience documented'],
    recommendations: ['Seek a tech-lead opportunity'],
    nextSteps: ['Update your resume summary'],
    contextSnapshot: {
      hasProfile: true,
      hasMasterResume: true,
      workExperienceCount: 1,
      educationCount: 0,
      skillsCount: 2,
      jobTargetsCount: 0,
      resumeVariantsCount: 0,
      applicationsCount: 0,
      atsReportsCount: 0,
      interviewSessionsCount: 0,
    },
    creditsUsed: 30,
    aiRequestId: 'ai-req-1',
    createdAt: '2026-08-27T10:00:00.000Z',
    ...overrides,
  };
}

describe('CareerAdvisorPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows loading skeletons for the history section while queries are in flight', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderWithQueryClient(<CareerAdvisorPage />);
    expect(screen.getByText('Histórico de recomendações')).toBeInTheDocument();
  });

  it('shows the credit cost once the estimate loads', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [] } },
    ]);
    renderWithQueryClient(<CareerAdvisorPage />);
    expect(await screen.findByText('Custo: 30 créditos')).toBeInTheDocument();
  });

  it('renders an empty state when there is no advice history yet', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [] } },
    ]);
    renderWithQueryClient(<CareerAdvisorPage />);
    expect(await screen.findByText('Ainda sem recomendações')).toBeInTheDocument();
  });

  it('renders prior advice in the history list', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [makeAdvice()] } },
    ]);
    renderWithQueryClient(<CareerAdvisorPage />);
    expect(await screen.findByText('What should I focus on next?')).toBeInTheDocument();
    expect(screen.getByText('Focus on closing your leadership gap.')).toBeInTheDocument();
  });

  it('fills the question field when a suggested question is clicked', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [] } },
    ]);
    renderWithQueryClient(<CareerAdvisorPage />);
    await screen.findByText('Custo: 30 créditos');

    fireEvent.click(screen.getByText('Quais são os meus principais pontos fortes?'));

    expect(screen.getByLabelText('Pergunta para o Career Advisor')).toHaveValue(
      'Quais são os meus principais pontos fortes?',
    );
  });

  it('disables the submit button and shows a warning when the balance is insufficient', async () => {
    mockFetchSequence([
      {
        body: {
          success: true,
          data: makeEstimate({ sufficientBalance: false, currentBalance: 5 }),
        },
      },
      { body: { success: true, data: [] } },
    ]);
    renderWithQueryClient(<CareerAdvisorPage />);

    fireEvent.change(screen.getByLabelText('Pergunta para o Career Advisor'), {
      target: { value: 'A question' },
    });

    await screen.findByText(/Saldo insuficiente/);
    expect(screen.getByRole('button', { name: /Pedir recomendação/ })).toBeDisabled();
  });

  it('submits a custom question and renders the structured response', async () => {
    const advice = makeAdvice({ question: 'How can I grow into a staff role?' });
    const mock = mockFetchByRoute({
      estimate: makeEstimate(),
      history: [],
      submit: { body: { success: true, data: advice } },
    });
    renderWithQueryClient(<CareerAdvisorPage />);
    await screen.findByText('Custo: 30 créditos');

    fireEvent.change(screen.getByLabelText('Pergunta para o Career Advisor'), {
      target: { value: 'How can I grow into a staff role?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Pedir recomendação/ }));

    await waitFor(() => {
      const submitCall = mock.mock.calls.find(
        ([url, init]) =>
          (url as string).includes('/career-advisor/advice') &&
          (init as RequestInit | undefined)?.method === 'POST',
      );
      expect(submitCall).toBeDefined();
      const [, init] = submitCall as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        question: 'How can I grow into a staff role?',
      });
    });

    expect(await screen.findByText('You have solid technical fundamentals.')).toBeInTheDocument();
    expect(screen.getByText(/Strong TypeScript skills/)).toBeInTheDocument();
    expect(screen.getByText(/No leadership experience documented/)).toBeInTheDocument();
    expect(screen.getByText(/Seek a tech-lead opportunity/)).toBeInTheDocument();
    expect(screen.getByText(/Update your resume summary/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Recomendação gerada.');
  });

  it('shows an error toast and keeps the question when the request fails', async () => {
    mockFetchSequence([
      { body: { success: true, data: makeEstimate() } },
      { body: { success: true, data: [] } },
      {
        body: {
          success: false,
          error: { message: 'Falha ao gerar recomendação.', code: 'AI_ERROR' },
        },
        status: 500,
      },
    ]);
    renderWithQueryClient(<CareerAdvisorPage />);
    await screen.findByText('Custo: 30 créditos');

    fireEvent.change(screen.getByLabelText('Pergunta para o Career Advisor'), {
      target: { value: 'A question' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Pedir recomendação/ }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Falha ao gerar recomendação.');
    });
    expect(screen.getByLabelText('Pergunta para o Career Advisor')).toHaveValue('A question');
  });
});
