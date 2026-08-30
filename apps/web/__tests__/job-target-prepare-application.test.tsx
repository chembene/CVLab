import { fireEvent, screen, waitFor } from '@testing-library/react';
import JobTargetDetailPage from '../app/dashboard/job-targets/[id]/page';
import { renderWithQueryClient } from '../lib/test-utils';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'jt-1' }),
  useRouter: () => ({ push }),
}));

const jobTarget = {
  id: 'jt-1',
  userId: 'user-1',
  title: 'Senior Backend Engineer',
  company: 'Acme',
  currency: 'MZN',
  status: 'READY',
  keywords: [],
  skills: [],
  languages: [],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

const variants = [
  {
    id: 'rv-1',
    userId: 'user-1',
    masterResumeId: 'mr-1',
    title: 'Main CV',
    version: 1,
    status: 'ACTIVE',
    archived: false,
    completionPercentage: 100,
    content: {},
    createdAt: '',
    updatedAt: '',
  },
];

function mockFetchSequence(bodies: { body: unknown; status?: number }[]) {
  const mock = jest.fn();
  for (const { body, status = 200 } of bodies) {
    mock.mockResolvedValueOnce({ status, ok: status < 400, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('Job Target detail — Preparar candidatura', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens a dialog listing the user's Resume Variants, and starting the pipeline navigates to the wizard", async () => {
    mockFetchSequence([
      { body: { success: true, data: jobTarget } }, // GET job target
      { body: { success: true, data: variants } }, // GET resume variants (ResumeVariantSelect)
      { body: { success: true, data: { id: 'session-1' } } }, // POST /application-pipeline
    ]);

    renderWithQueryClient(<JobTargetDetailPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Preparar candidatura' }));
    expect(await screen.findByText('Selecione uma versão de currículo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('Main CV'));

    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/dashboard/application-pipeline/session-1'),
    );
  });
});
