import { screen, fireEvent, waitFor } from '@testing-library/react';
import InterviewsPage from './page';
import { renderWithQueryClient } from '@/lib/test-utils';

/** URL+method-aware fetch mock — safer than a fixed call-order sequence since useInterviews()/useJobTargets()/useResumeVariants() all fire on mount and their relative order isn't a contract worth depending on. */
function mockFetch(handlers: Record<string, { body: unknown; status?: number }>): jest.Mock {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const entry = handlers[key];
    if (!entry) {
      return Promise.resolve({
        status: 404,
        json: async () => ({
          success: false,
          error: { code: 'NOT_MOCKED', message: `no mock for ${key}` },
        }),
      });
    }
    return Promise.resolve({ status: entry.status ?? 200, json: async () => entry.body });
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

const jobTarget = {
  id: 'jt-1',
  title: 'Senior Backend Engineer',
  company: 'Acme',
  keywords: [],
  skills: [],
  languages: [],
};

function setUpMocks(extra: Record<string, { body: unknown; status?: number }> = {}) {
  return mockFetch({
    'GET /api/v1/interview': { body: { success: true, data: [] } },
    'GET /api/v1/job-targets': { body: { success: true, data: [jobTarget] } },
    'GET /api/v1/resume-variants': { body: { success: true, data: [] } },
    ...extra,
  });
}

async function openStartDialog() {
  renderWithQueryClient(<InterviewsPage />);
  const newButtons = await screen.findAllByRole('button', { name: 'Nova entrevista' });
  fireEvent.click(newButtons[0]!);
  expect(await screen.findByText('Nova sessão de entrevista')).toBeInTheDocument();
}

function findStartRequest(mock: jest.Mock) {
  const call = mock.mock.calls.find(([url]) => (url as string).includes('/interview/start'));
  if (!call) return undefined;
  const init = call[1] as RequestInit;
  return JSON.parse(init.body as string);
}

describe('InterviewsPage — mode selection (FASE 11)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('defaults to mode RESUME, showing only the CV field', async () => {
    setUpMocks();
    await openStartDialog();

    expect(screen.getByText('Versão de currículo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cargo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Ou cole a descrição da vaga/)).not.toBeInTheDocument();
  });

  it('switching to mode JOB shows the Job Target select and job description field, hides the CV-required field', async () => {
    setUpMocks();
    await openStartDialog();

    fireEvent.click(screen.getByRole('radio', { name: /Praticar para uma vaga/ }));

    expect(screen.getByText('Vaga existente (opcional)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Ou cole a descrição da vaga/)).toBeInTheDocument();
    expect(screen.getByText('Versão de currículo (opcional)')).toBeInTheDocument();
    expect(screen.queryByText('Versão de currículo', { exact: true })).not.toBeInTheDocument();
  });

  it('switching to mode ROLE shows role/industry/years/company fields, hides CV and job fields', async () => {
    setUpMocks();
    await openStartDialog();

    fireEvent.click(screen.getByRole('radio', { name: /Praticar por cargo/ }));

    expect(screen.getByLabelText('Cargo')).toBeInTheDocument();
    expect(screen.getByLabelText(/Indústria/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Anos de experiência/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Empresa/)).toBeInTheDocument();
    expect(screen.queryByText('Versão de currículo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Ou cole a descrição da vaga/)).not.toBeInTheDocument();
  });

  it('rejects submitting mode ROLE without a role, and never calls the API', async () => {
    const fetchMock = setUpMocks();
    await openStartDialog();

    fireEvent.click(screen.getByRole('radio', { name: /Praticar por cargo/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));

    expect(await screen.findByText('Indique o cargo que pretende praticar.')).toBeInTheDocument();
    expect(findStartRequest(fetchMock)).toBeUndefined();
  });

  it('rejects submitting mode JOB without a Job Target or job description, and never calls the API', async () => {
    const fetchMock = setUpMocks();
    await openStartDialog();

    fireEvent.click(screen.getByRole('radio', { name: /Praticar para uma vaga/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));

    expect(
      await screen.findByText('Indique uma vaga existente ou cole a descrição da vaga.'),
    ).toBeInTheDocument();
    expect(findStartRequest(fetchMock)).toBeUndefined();
  });

  it('submits mode JOB with only a pasted job description, sending no resumeVariantId/jobTargetId', async () => {
    const fetchMock = setUpMocks({
      'POST /api/v1/interview/start': {
        body: { success: true, data: { id: 'session-1', mode: 'JOB', questions: [] } },
      },
    });
    await openStartDialog();

    fireEvent.click(screen.getByRole('radio', { name: /Praticar para uma vaga/ }));
    fireEvent.change(screen.getByLabelText(/Ou cole a descrição da vaga/), {
      target: { value: 'We are hiring a backend engineer.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));

    await waitFor(() => expect(findStartRequest(fetchMock)).toBeDefined());
    const body = findStartRequest(fetchMock);
    expect(body).toMatchObject({
      mode: 'JOB',
      jobDescription: 'We are hiring a backend engineer.',
    });
    expect(body.jobTargetId).toBeUndefined();
    expect(body.resumeVariantId).toBeUndefined();
    expect(body.role).toBeUndefined();
  });

  it('submits mode ROLE with role + industry, sending no CV/job fields', async () => {
    const fetchMock = setUpMocks({
      'POST /api/v1/interview/start': {
        body: { success: true, data: { id: 'session-2', mode: 'ROLE', questions: [] } },
      },
    });
    await openStartDialog();

    fireEvent.click(screen.getByRole('radio', { name: /Praticar por cargo/ }));
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Backend Developer' } });
    fireEvent.change(screen.getByLabelText(/Indústria/), { target: { value: 'Fintech' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar' }));

    await waitFor(() => expect(findStartRequest(fetchMock)).toBeDefined());
    const body = findStartRequest(fetchMock);
    expect(body).toMatchObject({ mode: 'ROLE', role: 'Backend Developer', industry: 'Fintech' });
    expect(body.resumeVariantId).toBeUndefined();
    expect(body.jobTargetId).toBeUndefined();
    expect(body.jobDescription).toBeUndefined();
  });

  it('clears mode-specific field values when switching modes', async () => {
    setUpMocks();
    await openStartDialog();

    fireEvent.click(screen.getByRole('radio', { name: /Praticar por cargo/ }));
    fireEvent.change(screen.getByLabelText('Cargo'), { target: { value: 'Backend Developer' } });

    fireEvent.click(screen.getByRole('radio', { name: /Praticar com o meu CV/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Praticar por cargo/ }));

    expect((screen.getByLabelText('Cargo') as HTMLInputElement).value).toBe('');
  });
});
