import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import TechnicalTestSessionPage from './page';
import { renderWithQueryClient } from '@/lib/test-utils';
import type { TestSessionView } from '@/lib/api/tests';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'session-1' }),
  useRouter: () => ({ push: jest.fn() }),
}));

function makeInProgressSession(overrides: Partial<TestSessionView> = {}): TestSessionView {
  return {
    id: 'session-1',
    userId: 'user-1',
    testId: 'test-1',
    attemptNumber: 1,
    status: 'IN_PROGRESS',
    score: null,
    startedAt: '2026-01-01T10:00:00.000Z',
    completedAt: null,
    remainingSeconds: 300,
    test: { id: 'test-1', title: 'SQL Básico', category: 'SQL', timeLimit: 10, questionCount: 1 },
    questions: [
      {
        id: 'q1',
        prompt: 'Qual comando obtém dados?',
        choices: ['SELECT', 'INSERT'],
        order: 0,
        selectedAnswer: null,
        isCorrect: null,
      },
    ],
    ...overrides,
  };
}

function makeCompletedSession(): TestSessionView {
  return {
    ...makeInProgressSession(),
    status: 'COMPLETED',
    score: 100,
    completedAt: '2026-01-01T10:05:00.000Z',
    remainingSeconds: null,
    questions: [
      {
        id: 'q1',
        prompt: 'Qual comando obtém dados?',
        choices: ['SELECT', 'INSERT'],
        order: 0,
        correctAnswer: 'SELECT',
        explanation: 'SELECT consulta dados.',
        selectedAnswer: 'SELECT',
        isCorrect: true,
      },
    ],
  };
}

function mockFetchByRoute(routes: {
  session: unknown;
  answer?: { body: unknown; status?: number };
  complete?: { body: unknown; status?: number };
}): jest.Mock {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes('/answer') && init?.method === 'POST') {
      return Promise.resolve({
        status: routes.answer?.status ?? 200,
        json: async () => routes.answer?.body,
      });
    }
    if (url.includes('/complete') && init?.method === 'POST') {
      return Promise.resolve({
        status: routes.complete?.status ?? 200,
        json: async () => routes.complete?.body,
      });
    }
    if (url.includes('/test-sessions/')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.session }),
      });
    }
    throw new Error(`Unexpected fetch call: ${url}`);
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('TechnicalTestSessionPage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders the active question with its choices, never revealing correctAnswer', async () => {
    mockFetchByRoute({ session: makeInProgressSession() });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    expect(await screen.findByText(/Qual comando obtém dados\?/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SELECT' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'INSERT' })).toBeInTheDocument();
  });

  it('shows the timer countdown for an in-progress timed session', async () => {
    mockFetchByRoute({ session: makeInProgressSession() });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    expect(await screen.findByText('Tempo restante')).toBeInTheDocument();
    expect(screen.getByText('5:00')).toBeInTheDocument();
  });

  it('selecting a choice submits the answer', async () => {
    const mock = mockFetchByRoute({
      session: makeInProgressSession(),
      answer: { body: { success: true, data: makeInProgressSession() } },
    });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    await screen.findByText(/Qual comando obtém dados\?/);

    fireEvent.click(screen.getByRole('button', { name: 'SELECT' }));

    await waitFor(() => {
      const answerCall = mock.mock.calls.find(([url]) => (url as string).includes('/answer'));
      expect(answerCall).toBeDefined();
      const [, init] = answerCall as [string, RequestInit];
      expect(JSON.parse(init.body as string)).toEqual({
        questionId: 'q1',
        selectedAnswer: 'SELECT',
      });
    });
  });

  it('shows an error toast when submitting an answer fails', async () => {
    mockFetchByRoute({
      session: makeInProgressSession(),
      answer: {
        body: { success: false, error: { message: 'Tempo esgotado.', code: 'CONFLICT' } },
        status: 409,
      },
    });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    await screen.findByText(/Qual comando obtém dados\?/);

    fireEvent.click(screen.getByRole('button', { name: 'SELECT' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Tempo esgotado.');
    });
  });

  it('submitting the test calls complete() and shows a success toast', async () => {
    mockFetchByRoute({
      session: makeInProgressSession(),
      complete: { body: { success: true, data: makeCompletedSession() } },
    });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    await screen.findByText(/Qual comando obtém dados\?/);

    fireEvent.click(screen.getByRole('button', { name: /Submeter Teste/ }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Teste submetido.');
    });
  });

  it('renders the score and explanations for a completed session', async () => {
    mockFetchByRoute({ session: makeCompletedSession() });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    expect(await screen.findByText('100')).toBeInTheDocument();
    expect(screen.getByText(/SELECT consulta dados\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submeter Teste/ })).not.toBeInTheDocument();
  });

  it('choices are disabled once the session is completed', async () => {
    mockFetchByRoute({ session: makeCompletedSession() });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    await screen.findByText('100');
    expect(screen.getByRole('button', { name: /SELECT/ })).toBeDisabled();
  });

  it('renders an EXPIRED attempt as locked: explanation, no submit button, answers never revealed', async () => {
    mockFetchByRoute({
      session: makeInProgressSession({ status: 'EXPIRED', remainingSeconds: 0 }),
    });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    expect(await screen.findByText('Tentativa expirada')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Submeter Teste/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SELECT' })).toBeDisabled();
    expect(screen.queryByText(/Explicação/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Voltar aos Testes Técnicos/ })).toBeInTheDocument();
  });

  it('asks the server for the authoritative state when the countdown reaches zero', async () => {
    const mock = mockFetchByRoute({ session: makeInProgressSession({ remainingSeconds: 0 }) });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    expect(await screen.findByText('Tempo esgotado')).toBeInTheDocument();
    await waitFor(() => {
      const sessionFetches = mock.mock.calls.filter(([url]) =>
        (url as string).includes('/test-sessions/'),
      );
      expect(sessionFetches.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByRole('button', { name: /Submeter Teste/ })).toBeDisabled();
  });

  it('shows an error state when the session fails to load', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ status: 500, json: async () => ({ success: false, error: {} }) });
    renderWithQueryClient(<TechnicalTestSessionPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
