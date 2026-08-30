import { fireEvent, screen, waitFor } from '@testing-library/react';
import ApplicationPipelinePage from '../app/dashboard/application-pipeline/[id]/page';
import { renderWithQueryClient } from '../lib/test-utils';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ id: 'session-1' }),
  useRouter: () => ({ push }),
}));

const baseSession = {
  id: 'session-1',
  userId: 'user-1',
  resumeVariantId: 'rv-1',
  jobTargetId: 'jt-1',
  atsReportId: null,
  optimizationId: null,
  newAtsReportId: null,
  coverLetterId: null,
  interviewSessionId: null,
  exportedDocumentId: null,
  applicationId: null,
  currentStep: 'ATS_ANALYSIS',
  status: 'IN_PROGRESS',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return { status, ok: status < 400, headers: { get: () => null }, json: async () => body };
}

describe('ApplicationPipelinePage', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders every step with the correct title', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        jsonResponse({ success: true, data: baseSession }),
      ) as unknown as typeof fetch;
    renderWithQueryClient(<ApplicationPipelinePage />);

    expect(await screen.findByText('Análise de compatibilidade (ATS)')).toBeInTheDocument();
    expect(screen.getByText('Melhorar currículo com IA')).toBeInTheDocument();
    expect(screen.getByText('Carta de apresentação')).toBeInTheDocument();
    expect(screen.getByText('Preparar entrevista')).toBeInTheDocument();
    expect(screen.getByText('Exportar documentos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Registar candidatura' })).toBeInTheDocument();
  });

  it('running the ATS step calls the step endpoint and shows the updated score once done', async () => {
    const mock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: baseSession })) // initial GET session
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { ...baseSession, atsReportId: 'ats-1', currentStep: 'OPTIMIZATION' },
        }),
      ) // POST steps/ats
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: { ...baseSession, atsReportId: 'ats-1', currentStep: 'OPTIMIZATION' },
        }),
      ) // refetch GET session
      .mockResolvedValue(
        jsonResponse({
          success: true,
          data: {
            id: 'ats-1',
            overallScore: 72,
            matchedKeywords: ['TypeScript'],
            missingKeywords: ['Docker'],
          },
        }),
      ); // GET ats report
    global.fetch = mock as unknown as typeof fetch;

    renderWithQueryClient(<ApplicationPipelinePage />);
    const button = await screen.findByRole('button', { name: 'Analisar compatibilidade' });
    fireEvent.click(button);

    await waitFor(() =>
      expect(mock).toHaveBeenCalledWith(
        expect.stringContaining('/application-pipeline/session-1/steps/ats'),
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('exporting a PDF triggers the binary export endpoint and a browser download', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = jest.fn();

    const mock = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ success: true, data: baseSession })) // initial GET session
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        headers: {
          get: (name: string) =>
            name === 'Content-Disposition' ? 'attachment; filename="curriculo.pdf"' : null,
        },
        blob: async () => new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
      }) // POST steps/export (binary)
      .mockResolvedValue(
        jsonResponse({
          success: true,
          data: { ...baseSession, exportedDocumentId: 'export-1', currentStep: 'FINALIZE' },
        }),
      ); // refetch GET session
    global.fetch = mock as unknown as typeof fetch;

    renderWithQueryClient(<ApplicationPipelinePage />);
    const button = await screen.findByRole('button', { name: /Exportar PDF/ });
    fireEvent.click(button);

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('/application-pipeline/session-1/steps/export'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ format: 'PDF' }) }),
    );

    URL.createObjectURL = originalCreateObjectURL;
  });

  it('shows a "Ver candidatura" link to the created Application once the finalize step is done', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          ...baseSession,
          applicationId: 'app-1',
          currentStep: 'SUMMARY',
          status: 'COMPLETED',
        },
      }),
    ) as unknown as typeof fetch;

    renderWithQueryClient(<ApplicationPipelinePage />);

    const link = await screen.findByRole('link', { name: 'Ver candidatura' });
    expect(link).toHaveAttribute('href', '/dashboard/applications/app-1');
  });
});
