import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import ResumePage from './page';
import { renderWithQueryClient } from '@/lib/test-utils';

const RESUME = {
  id: 'mr-1',
  userId: 'user-1',
  title: 'Currículo de Ana Machava',
  summary: 'Profissional de marketing digital.',
  completionPercentage: 42,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const PROFILE = { id: 'p-1', userId: 'user-1', firstName: 'Ana', lastName: 'Machava' };

// ResumeOverviewCard renders a real ResumePreview thumbnail, which fetches
// the default template ('ats-classic', see DEFAULT_RESUME_TEMPLATE_ID) —
// needs a valid TemplateMetadata shape or ResumeLayout crashes on
// `supportedSections.includes(...)`.
const TEMPLATE = {
  id: 'ats-classic',
  name: 'ATS Classic',
  category: 'classic',
  isATSFriendly: true,
  premium: false,
  version: 1,
  primaryColor: '#000000',
  secondaryColor: '#333333',
  font: 'Inter',
  layout: 'single-column',
  supportedSections: ['summary', 'workExperiences', 'educations', 'skills'],
  status: 'ACTIVE',
};

/**
 * Matches by URL suffix instead of call order — the page fires the master
 * resume, profile, and one `useSection()` fetch per section type
 * concurrently on mount (all unconditional hooks per the rules of hooks),
 * and React doesn't guarantee a stable cross-hook fetch order, unlike the
 * single/dual-fetch pages elsewhere in this suite that rely on
 * mockResolvedValueOnce sequencing.
 */
function mockFetchByUrl(
  routes: Record<string, unknown>,
  fallback: unknown = { success: true, data: [] },
) {
  const mock = jest.fn((url: string) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const match = Object.entries(routes).find(([suffix]) => path.endsWith(suffix));
    const body = match ? match[1] : fallback;
    return Promise.resolve({ status: 200, json: async () => body });
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('ResumePage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows a loading skeleton before the master resume resolves', () => {
    global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    renderWithQueryClient(<ResumePage />);
    expect(screen.queryByText('Comece o seu currículo principal')).not.toBeInTheDocument();
  });

  it('shows the empty state with import/manual actions when there is no master resume yet', async () => {
    mockFetchByUrl({
      '/resume': { success: true, data: null },
      '/profile': { success: true, data: null },
    });
    renderWithQueryClient(<ResumePage />);
    await waitFor(() =>
      expect(screen.getByText('Comece o seu currículo principal')).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: /Importar CV/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Preencher manualmente' })).toBeInTheDocument();
  });

  it('shows the overview card and opens the tabbed editor on click', async () => {
    mockFetchByUrl({
      '/resume': { success: true, data: RESUME },
      '/profile': { success: true, data: PROFILE },
      '/templates/resume/ats-classic': { success: true, data: TEMPLATE },
    });
    renderWithQueryClient(<ResumePage />);

    await waitFor(() => expect(screen.getByLabelText(/Abrir editor de/)).toBeInTheDocument());
    // Appears both as the card's own label and inside its live ResumePreview
    // thumbnail (the preview renders the resume's title too) — assert
    // presence, not uniqueness.
    expect(screen.getAllByText('Currículo de Ana Machava').length).toBeGreaterThan(0);

    await act(async () => {
      screen.getByLabelText(/Abrir editor de/).click();
    });

    expect(screen.getByRole('tab', { name: 'Resumo' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Experiência Profissional' })).toBeInTheDocument();
    expect(screen.getByLabelText('Título do currículo')).toHaveValue('Currículo de Ana Machava');
  });

  it('returns to the overview when "Voltar" is clicked', async () => {
    mockFetchByUrl({
      '/resume': { success: true, data: RESUME },
      '/profile': { success: true, data: PROFILE },
      '/templates/resume/ats-classic': { success: true, data: TEMPLATE },
    });
    renderWithQueryClient(<ResumePage />);

    await waitFor(() => expect(screen.getByLabelText(/Abrir editor de/)).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText(/Abrir editor de/));

    const backButton = await screen.findByRole('button', { name: /Voltar à pré-visualização/ });
    fireEvent.click(backButton);

    await waitFor(() => expect(screen.getByLabelText(/Abrir editor de/)).toBeInTheDocument());
  });

  it('switches to a section tab and shows its manager', async () => {
    mockFetchByUrl({
      '/resume': { success: true, data: RESUME },
      '/profile': { success: true, data: PROFILE },
      '/templates/resume/ats-classic': { success: true, data: TEMPLATE },
    });
    renderWithQueryClient(<ResumePage />);

    await waitFor(() => expect(screen.getByLabelText(/Abrir editor de/)).toBeInTheDocument());
    await act(async () => {
      screen.getByLabelText(/Abrir editor de/).click();
    });

    // Radix Tabs' default "automatic" activation mode switches tabs on
    // focus (RovingFocusGroupItem focuses the trigger on mousedown, then
    // Tabs.Trigger's onFocus fires the value change) rather than on click
    // directly — jsdom's fireEvent.click doesn't itself move focus, so we
    // focus explicitly first, same as a real pointer click would.
    const skillsTab = await screen.findByRole('tab', { name: 'Competências' });
    await act(async () => {
      skillsTab.focus();
      skillsTab.click();
    });

    await waitFor(() =>
      expect(screen.getByText(/Ainda não adicionou nenhuma competência/)).toBeInTheDocument(),
    );
  });
});
