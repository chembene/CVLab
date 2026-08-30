import { fireEvent, screen, waitFor } from '@testing-library/react';
import ApplicationDetailPage from '../app/dashboard/applications/[id]/page';
import { renderWithQueryClient } from '../lib/test-utils';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'app-1' }),
  useRouter: () => ({ push }),
}));

function mockFetchByUrl(routes: Record<string, unknown>) {
  const mock = jest.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT' || init?.method === 'DELETE') {
      return Promise.resolve({
        status: 200,
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });
    }
    const match = Object.entries(routes).find(([path]) => url.includes(path));
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return Promise.resolve({
      status: 200,
      ok: true,
      json: async () => ({ success: true, data: match[1] }),
    });
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

const jobTargets = [
  {
    id: 'jt-1',
    userId: 'user-1',
    title: 'Senior Backend Engineer',
    company: 'Acme',
    location: 'Maputo',
    currency: 'MZN',
    status: 'READY',
    keywords: [],
    skills: [],
    languages: [],
    createdAt: '',
    updatedAt: '',
  },
];

const resumeVariants = [
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

const application = {
  id: 'app-1',
  userId: 'user-1',
  jobTargetId: 'jt-1',
  resumeVariantId: 'rv-1',
  resumeVariantVersionId: 'rvv-1',
  status: 'SAVED',
  appliedAt: null,
  interviewDate: null,
  result: null,
  notes: null,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
};

describe('ApplicationDetailPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    push.mockClear();
  });

  it('renders the Job Target, Resume Variant, and status of the application', async () => {
    mockFetchByUrl({
      '/applications': [application],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationDetailPage />);

    expect(
      await screen.findByRole('heading', { name: 'Senior Backend Engineer' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText('Main CV')).toBeInTheDocument();
  });

  it('shows a not-found state for a non-existent application id', async () => {
    mockFetchByUrl({
      '/applications': [],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationDetailPage />);

    expect(await screen.findByText('Candidatura não encontrada')).toBeInTheDocument();
  });

  it('changing the status calls the update endpoint', async () => {
    const mock = mockFetchByUrl({
      '/applications': [application],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationDetailPage />);
    await screen.findByRole('heading', { name: 'Senior Backend Engineer' });

    const statusSelect = screen.getByRole('combobox');
    statusSelect.focus();
    fireEvent.click(statusSelect);
    fireEvent.click(await screen.findByText('Applied'));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar alterações' }));

    await waitFor(() =>
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining('/applications/app-1'),
        expect.objectContaining({ method: 'PUT' }),
      ),
    );
  });

  it('deletes the application after confirmation, then redirects to /dashboard/applications', async () => {
    const mock = mockFetchByUrl({
      '/applications': [application],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationDetailPage />);
    await screen.findByRole('heading', { name: 'Senior Backend Engineer' });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    const dialogButtons = await screen.findAllByRole('button', { name: 'Eliminar' });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]!);

    await waitFor(() =>
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining('/applications/app-1'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/applications'));
  });
});
