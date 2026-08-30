import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import ImportCvPage from './page';
import { renderWithQueryClient } from '@/lib/test-utils';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

function selectValidFile() {
  const file = makeFile('cv.pdf', 'application/pdf', 10_000);
  fireEvent.change(getFileInput(), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Importar CV' }));
}

const extractedData = {
  personalData: { fullName: 'Ana Machava', email: 'ana@example.com' },
  summary: 'Profissional de marketing.',
  workExperiences: [],
  educations: [],
  skills: [{ name: 'SEO' }],
  languages: [],
  certificates: [],
  projects: [],
  awards: [],
  volunteerExperiences: [],
  references: [],
};

const uploadedCvImport = {
  id: 'cvi-1',
  userId: 'user-1',
  fileName: 'cv.pdf',
  fileType: 'PDF',
  fileSizeBytes: 10_000,
  status: 'EXTRACTED',
  extractedData,
  fieldConfidence: { 'personalData.email': 0.95 },
  creditsUsed: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const NO_MASTER_RESUME = { body: { success: true, data: null } };
const EXISTING_MASTER_RESUME = {
  body: { success: true, data: { id: 'mr-existing', userId: 'user-1' } },
};
const MERGE_PREVIEW_EMPTY = {
  body: {
    success: true,
    data: {
      workExperiences: [],
      educations: [],
      skills: [],
      languages: [],
      certificates: [],
      projects: [],
      awards: [],
      volunteerExperiences: [],
      references: [],
      newCount: 0,
      duplicateCount: 0,
    },
  },
};

/**
 * Flushes the microtask queue (act-wrapped, so react-query's resulting
 * state update doesn't warn) so the mount-time useMasterResume() query has
 * actually applied its resolved value before a test synchronously reads
 * page state that depends on it (a bare "fetch was called once" check can
 * pass before react-query propagates the response to the next render).
 */
async function settleMasterResumeQuery(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** useMasterResume() fires on mount, before any user action — always the first call in the sequence. */
function mockFetchSequence(bodies: { body: unknown; status?: number }[]): jest.Mock {
  const mock = jest.fn();
  for (const { body, status = 200 } of bodies) {
    mock.mockResolvedValueOnce({ status, json: async () => body });
  }
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('ImportCvPage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('starts on the idle dropzone', () => {
    mockFetchSequence([NO_MASTER_RESUME]);
    renderWithQueryClient(<ImportCvPage />);
    expect(screen.getByText('Arraste o seu CV aqui')).toBeInTheDocument();
  });

  it('shows a processing state, then the review screen once upload succeeds (no existing Master Resume)', async () => {
    mockFetchSequence([NO_MASTER_RESUME, { body: { success: true, data: uploadedCvImport } }]);
    renderWithQueryClient(<ImportCvPage />);

    // Let the mount-time useMasterResume() query actually settle (not just
    // "fetch was called") before the click handler reads masterResume.data
    // synchronously — a bare fetch-call-count check can pass before
    // react-query has applied the resolved value to the next render.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await settleMasterResumeQuery();
    selectValidFile();

    expect(await screen.findByRole('status')).toHaveTextContent(
      /A carregar|A extrair|A analisar|A preparar/,
    );

    expect(await screen.findByText('Rever informações')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Ana Machava')).toBeInTheDocument();
    expect(screen.getByText('Alta confiança')).toBeInTheDocument();
  });

  it('shows an error state (not a stuck spinner) when the upload fails', async () => {
    mockFetchSequence([
      NO_MASTER_RESUME,
      {
        body: {
          success: false,
          error: { code: 'BAD_FILE', message: 'Não foi possível extrair texto do ficheiro.' },
        },
        status: 400,
      },
    ]);
    renderWithQueryClient(<ImportCvPage />);

    // Let the mount-time useMasterResume() query actually settle (not just
    // "fetch was called") before the click handler reads masterResume.data
    // synchronously — a bare fetch-call-count check can pass before
    // react-query has applied the resolved value to the next render.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await settleMasterResumeQuery();
    selectValidFile();

    expect(await screen.findByText('Não foi possível importar o CV')).toBeInTheDocument();
    expect(screen.getByText('Não foi possível extrair texto do ficheiro.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(screen.getByText('Arraste o seu CV aqui')).toBeInTheDocument();
  });

  it('lets the user edit a field and remove an entry before confirming, then shows the success screen', async () => {
    const fetchMock = mockFetchSequence([
      NO_MASTER_RESUME,
      { body: { success: true, data: uploadedCvImport } },
      {
        body: {
          success: true,
          data: {
            masterResume: { id: 'mr-1', userId: 'user-1' },
            skippedEntries: [],
            keptExistingEntries: [],
            updatedEntries: [],
          },
        },
      },
    ]);
    renderWithQueryClient(<ImportCvPage />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await settleMasterResumeQuery();
    selectValidFile();
    await screen.findByText('Rever informações');

    fireEvent.change(screen.getByDisplayValue('Ana Machava'), {
      target: { value: 'Ana P. Machava' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e importar' }));

    await waitFor(() => expect(screen.getByText('Importação concluída')).toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('CV importado com sucesso.');

    // The edited value, not the original, was sent to confirm() — call #3 (after the master-resume check and upload).
    const confirmCall = fetchMock.mock.calls[2]!;
    expect(confirmCall[0]).toContain('/cv-import/cvi-1/confirm');
    const sentBody = JSON.parse(confirmCall[1].body as string);
    expect(sentBody.personalData.fullName).toBe('Ana P. Machava');

    expect(screen.getByRole('button', { name: 'Abrir Currículo Principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao Dashboard' })).toBeInTheDocument();
  });

  it('shows skippedEntries on the success screen when confirm() reports any', async () => {
    mockFetchSequence([
      NO_MASTER_RESUME,
      { body: { success: true, data: uploadedCvImport } },
      {
        body: {
          success: true,
          data: {
            masterResume: { id: 'mr-1', userId: 'user-1' },
            skippedEntries: ['Skill "SEO" (already exists on this resume)'],
            keptExistingEntries: [],
            updatedEntries: [],
          },
        },
      },
    ]);
    renderWithQueryClient(<ImportCvPage />);

    // Let the mount-time useMasterResume() query actually settle (not just
    // "fetch was called") before the click handler reads masterResume.data
    // synchronously — a bare fetch-call-count check can pass before
    // react-query has applied the resolved value to the next render.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await settleMasterResumeQuery();
    selectValidFile();
    await screen.findByText('Rever informações');
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar e importar' }));

    await waitFor(() =>
      expect(screen.getByText('Algumas entradas não foram importadas')).toBeInTheDocument(),
    );
    expect(screen.getByText('Skill "SEO" (already exists on this resume)')).toBeInTheDocument();
  });

  it('discards the import and returns to idle when "Cancelar" is clicked', async () => {
    mockFetchSequence([
      NO_MASTER_RESUME,
      { body: { success: true, data: uploadedCvImport } },
      { body: { success: true, data: { ...uploadedCvImport, status: 'DISCARDED' } } },
    ]);
    renderWithQueryClient(<ImportCvPage />);

    // Let the mount-time useMasterResume() query actually settle (not just
    // "fetch was called") before the click handler reads masterResume.data
    // synchronously — a bare fetch-call-count check can pass before
    // react-query has applied the resolved value to the next render.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    await settleMasterResumeQuery();
    selectValidFile();
    await screen.findByText('Rever informações');

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.getByText('Arraste o seu CV aqui')).toBeInTheDocument());
  });

  describe('when the user already has a Master Resume', () => {
    it('shows the existing-resume choice screen instead of jumping straight to review', async () => {
      mockFetchSequence([
        EXISTING_MASTER_RESUME,
        { body: { success: true, data: uploadedCvImport } },
        MERGE_PREVIEW_EMPTY,
      ]);
      renderWithQueryClient(<ImportCvPage />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      await settleMasterResumeQuery();
      selectValidFile();

      expect(await screen.findByText('Já possui um Currículo Principal')).toBeInTheDocument();
      expect(screen.queryByText('Rever informações')).not.toBeInTheDocument();
    });

    it('shows the merge-preview counts once loaded (brief §14/§15)', async () => {
      mockFetchSequence([
        EXISTING_MASTER_RESUME,
        { body: { success: true, data: uploadedCvImport } },
        {
          body: {
            success: true,
            data: { ...MERGE_PREVIEW_EMPTY.body.data, newCount: 3, duplicateCount: 1 },
          },
        },
      ]);
      renderWithQueryClient(<ImportCvPage />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      await settleMasterResumeQuery();
      selectValidFile();
      await screen.findByText('Já possui um Currículo Principal');

      expect(
        await screen.findByText(/Encontrámos 1 possível duplicado e 3 novas entradas/),
      ).toBeInTheDocument();
    });

    it('"Mesclar com Currículo Principal" goes to the normal review screen, with merge-specific copy', async () => {
      mockFetchSequence([
        EXISTING_MASTER_RESUME,
        { body: { success: true, data: uploadedCvImport } },
        MERGE_PREVIEW_EMPTY,
      ]);
      renderWithQueryClient(<ImportCvPage />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      await settleMasterResumeQuery();
      selectValidFile();
      await screen.findByText('Já possui um Currículo Principal');

      fireEvent.click(screen.getByRole('button', { name: 'Mesclar com Currículo Principal' }));

      expect(await screen.findByText('Rever informações')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirmar e mesclar' })).toBeInTheDocument();
    });

    it('FASE 7 audit: shows the "Existente vs Importado" diff banner in review when a possible duplicate is found', async () => {
      mockFetchSequence([
        EXISTING_MASTER_RESUME,
        { body: { success: true, data: uploadedCvImport } },
        {
          body: {
            success: true,
            data: {
              ...MERGE_PREVIEW_EMPTY.body.data,
              skills: [
                {
                  entry: { name: 'SEO' },
                  status: 'possible_duplicate',
                  existingId: 'skill-existing-1',
                  existing: { name: 'seo (avancado)' },
                },
              ],
              duplicateCount: 1,
            },
          },
        },
      ]);
      renderWithQueryClient(<ImportCvPage />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      await settleMasterResumeQuery();
      selectValidFile();
      await screen.findByText('Já possui um Currículo Principal');

      fireEvent.click(screen.getByRole('button', { name: 'Mesclar com Currículo Principal' }));
      await screen.findByText('Rever informações');

      expect(await screen.findByText(/Possível duplicado/)).toBeInTheDocument();
      expect(screen.getByText('seo (avancado)')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Usar importado' })).toBeInTheDocument();
    });

    it('"Confirmar e mesclar" sends strategy:"merge" explicitly', async () => {
      const fetchMock = mockFetchSequence([
        EXISTING_MASTER_RESUME,
        { body: { success: true, data: uploadedCvImport } },
        MERGE_PREVIEW_EMPTY,
        {
          body: {
            success: true,
            data: {
              masterResume: { id: 'mr-existing', userId: 'user-1' },
              skippedEntries: [],
              keptExistingEntries: [],
              updatedEntries: [],
            },
          },
        },
      ]);
      renderWithQueryClient(<ImportCvPage />);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await settleMasterResumeQuery();
      selectValidFile();
      await screen.findByText('Já possui um Currículo Principal');
      fireEvent.click(screen.getByRole('button', { name: 'Mesclar com Currículo Principal' }));
      await screen.findByText('Rever informações');

      fireEvent.click(screen.getByRole('button', { name: 'Confirmar e mesclar' }));

      await waitFor(() =>
        expect(screen.getByText('Currículo Principal atualizado')).toBeInTheDocument(),
      );
      expect(toast.success).toHaveBeenCalledWith('Currículo Principal atualizado com sucesso.');
      const confirmCall = fetchMock.mock.calls[3]!;
      expect(confirmCall[0]).toContain('/cv-import/cvi-1/confirm');
      expect(JSON.parse(confirmCall[1].body as string).strategy).toBe('merge');
    });

    it('"Substituir Currículo Principal" confirms immediately with strategy:"replace", without visiting the review screen', async () => {
      const fetchMock = mockFetchSequence([
        EXISTING_MASTER_RESUME,
        { body: { success: true, data: uploadedCvImport } },
        MERGE_PREVIEW_EMPTY,
        {
          body: {
            success: true,
            data: {
              masterResume: { id: 'mr-existing', userId: 'user-1' },
              skippedEntries: [],
              keptExistingEntries: [],
              updatedEntries: [],
            },
          },
        },
      ]);
      renderWithQueryClient(<ImportCvPage />);

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      await settleMasterResumeQuery();
      selectValidFile();
      await screen.findByText('Já possui um Currículo Principal');

      fireEvent.click(screen.getByRole('button', { name: 'Substituir Currículo Principal' }));

      await waitFor(() =>
        expect(screen.getByText('Currículo Principal substituído')).toBeInTheDocument(),
      );
      expect(toast.success).toHaveBeenCalledWith('Currículo Principal substituído com sucesso.');
      const confirmCall = fetchMock.mock.calls[3]!;
      expect(confirmCall[0]).toContain('/cv-import/cvi-1/confirm');
      expect(JSON.parse(confirmCall[1].body as string).strategy).toBe('replace');
    });

    it('"Cancelar" on the choice screen discards the import and returns to idle', async () => {
      mockFetchSequence([
        EXISTING_MASTER_RESUME,
        { body: { success: true, data: uploadedCvImport } },
        MERGE_PREVIEW_EMPTY,
        { body: { success: true, data: { ...uploadedCvImport, status: 'DISCARDED' } } },
      ]);
      renderWithQueryClient(<ImportCvPage />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
      await settleMasterResumeQuery();
      selectValidFile();
      await screen.findByText('Já possui um Currículo Principal');

      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.getByText('Arraste o seu CV aqui')).toBeInTheDocument());
    });
  });
});
