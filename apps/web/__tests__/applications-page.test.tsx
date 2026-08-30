import { fireEvent, screen, waitFor } from '@testing-library/react';
import ApplicationsPage from '../app/dashboard/applications/page';
import { renderWithQueryClient } from '../lib/test-utils';

/** Routes global.fetch by URL substring instead of call order — robust against useApplications()/useJobTargets()/useResumeVariants() firing in parallel. */
function mockFetchByUrl(routes: Record<string, unknown>) {
  const mock = jest.fn((url: string) => {
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
  {
    id: 'jt-2',
    userId: 'user-1',
    title: 'Frontend Developer',
    company: 'Globex',
    location: 'Beira',
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

function makeApplication(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'app-1',
    userId: 'user-1',
    jobTargetId: 'jt-1',
    resumeVariantId: 'rv-1',
    status: 'SAVED',
    appliedAt: null,
    interviewDate: null,
    result: null,
    notes: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('ApplicationsPage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the loading state before data arrives', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = renderWithQueryClient(<ApplicationsPage />);
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThan(0);
  });

  it('shows the empty state when there are no applications', async () => {
    mockFetchByUrl({ '/applications': [], '/job-targets': [], '/resume-variants': [] });
    renderWithQueryClient(<ApplicationsPage />);
    expect(await screen.findByText('Ainda sem candidaturas')).toBeInTheDocument();
  });

  it('shows the error state when the query fails', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      status: 500,
      ok: false,
      json: async () => ({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' },
      }),
    }) as unknown as typeof fetch;
    renderWithQueryClient(<ApplicationsPage />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('renders applications enriched with their Job Target and Resume Variant', async () => {
    mockFetchByUrl({
      '/applications': [makeApplication()],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationsPage />);

    expect(await screen.findByText('Senior Backend Engineer')).toBeInTheDocument();
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText(/Main CV/)).toBeInTheDocument();
  });

  it('searches by job title', async () => {
    mockFetchByUrl({
      '/applications': [
        makeApplication({ id: 'app-1', jobTargetId: 'jt-1' }),
        makeApplication({ id: 'app-2', jobTargetId: 'jt-2' }),
      ],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationsPage />);
    await screen.findByText('Senior Backend Engineer');

    fireEvent.change(screen.getByLabelText('Pesquisar candidaturas'), {
      target: { value: 'Frontend' },
    });

    expect(screen.queryByText('Senior Backend Engineer')).not.toBeInTheDocument();
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument();
  });

  it('searches by company', async () => {
    mockFetchByUrl({
      '/applications': [
        makeApplication({ id: 'app-1', jobTargetId: 'jt-1' }),
        makeApplication({ id: 'app-2', jobTargetId: 'jt-2' }),
      ],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationsPage />);
    await screen.findByText('Senior Backend Engineer');

    fireEvent.change(screen.getByLabelText('Pesquisar candidaturas'), {
      target: { value: 'Globex' },
    });

    expect(screen.queryByText('Senior Backend Engineer')).not.toBeInTheDocument();
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument();
  });

  it('filters by status via the tabs', async () => {
    mockFetchByUrl({
      '/applications': [
        makeApplication({ id: 'app-1', jobTargetId: 'jt-1', status: 'SAVED' }),
        makeApplication({ id: 'app-2', jobTargetId: 'jt-2', status: 'OFFER' }),
      ],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationsPage />);
    await screen.findByText('Senior Backend Engineer');

    const offerTab = screen.getByRole('tab', { name: 'Ofertas' });
    offerTab.focus();
    fireEvent.click(offerTab);

    await waitFor(() =>
      expect(screen.queryByText('Senior Backend Engineer')).not.toBeInTheDocument(),
    );
    expect(screen.getByText('Frontend Developer')).toBeInTheDocument();
  });

  it('sorts by date, newest first by default', async () => {
    mockFetchByUrl({
      '/applications': [
        makeApplication({
          id: 'app-1',
          jobTargetId: 'jt-1',
          createdAt: '2026-08-01T00:00:00.000Z',
        }),
        makeApplication({
          id: 'app-2',
          jobTargetId: 'jt-2',
          createdAt: '2026-08-05T00:00:00.000Z',
        }),
      ],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationsPage />);
    await screen.findByText('Senior Backend Engineer');

    const titles = screen.getAllByText(/Engineer|Developer/).map((el) => el.textContent);
    // app-2 (Aug 5, Frontend Developer) is newer than app-1 (Aug 1, Senior Backend Engineer).
    expect(titles.indexOf('Frontend Developer')).toBeLessThan(
      titles.indexOf('Senior Backend Engineer'),
    );
  });

  it('renders a quick status-change control on each card, showing the current status', async () => {
    mockFetchByUrl({
      '/applications': [makeApplication({ status: 'INTERVIEW' })],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationsPage />);
    await screen.findByText('Senior Backend Engineer');

    // Two comboboxes render: the page-level sort order, and this card's own status select (mudança de status is covered end-to-end on the detail page, where the select isn't nested inside a Link's click-guard).
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);
    expect(comboboxes[1]).toHaveTextContent('Interview');
  });

  it('navigates to the detail page when a card is clicked', async () => {
    mockFetchByUrl({
      '/applications': [makeApplication()],
      '/job-targets': jobTargets,
      '/resume-variants': resumeVariants,
    });
    renderWithQueryClient(<ApplicationsPage />);
    const link = (await screen.findByText('Senior Backend Engineer')).closest('a');
    expect(link).toHaveAttribute('href', '/dashboard/applications/app-1');
  });
});
