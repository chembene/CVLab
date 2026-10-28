import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import TechnicalTestsPage from './page';
import { renderWithQueryClient } from '@/lib/test-utils';
import { ALL_NAV_ITEMS } from '@/lib/nav-items';
import type { TechnicalTestSummary, TestSessionHistoryEntry } from '@/lib/api/tests';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function makeTest(overrides: Partial<TechnicalTestSummary> = {}): TechnicalTestSummary {
  return {
    id: 'test-1',
    title: 'SQL Básico',
    category: 'SQL',
    timeLimit: 10,
    questionCount: 4,
    ...overrides,
  };
}

function makeHistoryEntry(
  overrides: Partial<TestSessionHistoryEntry> = {},
): TestSessionHistoryEntry {
  return {
    id: 'session-1',
    testId: 'test-1',
    testTitle: 'SQL Básico',
    testCategory: 'SQL',
    attemptNumber: 1,
    status: 'COMPLETED',
    score: 75,
    startedAt: '2026-01-01T10:00:00.000Z',
    completedAt: '2026-01-01T10:10:00.000Z',
    ...overrides,
  };
}

function mockFetchByRoute(routes: {
  tests: unknown;
  history: unknown;
  start?: { body: unknown; status?: number };
}): jest.Mock {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    if (url.includes('/tests/') && url.includes('/start') && init?.method === 'POST') {
      return Promise.resolve({
        status: routes.start?.status ?? 200,
        json: async () => routes.start?.body,
      });
    }
    if (url.includes('/tests')) {
      return Promise.resolve({
        status: 200,
        json: async () => ({ success: true, data: routes.tests }),
      });
    }
    if (url.includes('/test-sessions')) {
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

describe('TechnicalTestsPage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('shows a loading skeleton while the catalog loads', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderWithQueryClient(<TechnicalTestsPage />);
    expect(screen.getByText('Testes disponíveis')).toBeInTheDocument();
  });

  it('renders an empty state when there are no tests', async () => {
    mockFetchByRoute({ tests: [], history: [] });
    renderWithQueryClient(<TechnicalTestsPage />);
    expect(await screen.findByText('Sem testes disponíveis')).toBeInTheDocument();
  });

  it('renders an empty history state when there are no attempts yet', async () => {
    mockFetchByRoute({ tests: [], history: [] });
    renderWithQueryClient(<TechnicalTestsPage />);
    expect(await screen.findByText('Ainda sem tentativas')).toBeInTheDocument();
  });

  it('lists available tests with category, question count, and time limit', async () => {
    mockFetchByRoute({ tests: [makeTest()], history: [] });
    renderWithQueryClient(<TechnicalTestsPage />);
    expect(await screen.findByText('SQL Básico')).toBeInTheDocument();
    expect(screen.getByText('4 perguntas')).toBeInTheDocument();
    expect(screen.getByText('10 min')).toBeInTheDocument();
  });

  it('never shows a credit cost anywhere on this page (free by design)', async () => {
    mockFetchByRoute({ tests: [makeTest()], history: [] });
    renderWithQueryClient(<TechnicalTestsPage />);
    await screen.findByText('SQL Básico');
    expect(screen.queryByText(/créditos/i)).not.toBeInTheDocument();
  });

  it('renders prior attempts with status and score', async () => {
    mockFetchByRoute({ tests: [], history: [makeHistoryEntry()] });
    renderWithQueryClient(<TechnicalTestsPage />);
    expect(await screen.findByText(/SQL Básico/)).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
  });

  it('renders an EXPIRED attempt with its status badge and no score', async () => {
    mockFetchByRoute({
      tests: [],
      history: [makeHistoryEntry({ status: 'EXPIRED', score: null, completedAt: null })],
    });
    renderWithQueryClient(<TechnicalTestsPage />);
    expect(await screen.findByText(/SQL Básico/)).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.queryByText('75')).not.toBeInTheDocument();
  });

  it('starting a test navigates to the new session', async () => {
    mockFetchByRoute({
      tests: [makeTest()],
      history: [],
      start: { body: { success: true, data: { id: 'session-new' } } },
    });
    renderWithQueryClient(<TechnicalTestsPage />);
    await screen.findByText('SQL Básico');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Teste' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/dashboard/technical-tests/session-new');
    });
  });

  it('shows an error toast when starting a test fails', async () => {
    mockFetchByRoute({
      tests: [makeTest()],
      history: [],
      start: {
        body: { success: false, error: { message: 'Teste indisponível.', code: 'BAD' } },
        status: 400,
      },
    });
    renderWithQueryClient(<TechnicalTestsPage />);
    await screen.findByText('SQL Básico');

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar Teste' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Teste indisponível.');
    });
  });

  it('clicking a history entry navigates to its session page', async () => {
    mockFetchByRoute({ tests: [], history: [makeHistoryEntry()] });
    renderWithQueryClient(<TechnicalTestsPage />);
    fireEvent.click(await screen.findByText(/SQL Básico/));
    expect(push).toHaveBeenCalledWith('/dashboard/technical-tests/session-1');
  });
});

describe('Technical Tests navigation entry', () => {
  it('is registered in the sidebar/mobile nav item list', () => {
    const entry = ALL_NAV_ITEMS.find((item) => item.href === '/dashboard/technical-tests');
    expect(entry).toBeDefined();
    expect(entry?.label).toBe('Testes Técnicos');
  });
});
