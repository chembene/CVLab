import { fireEvent, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { ExportResumeButton } from '../components/resume-variants/export-resume-button';
import { renderWithQueryClient } from '../lib/test-utils';

/** A controllable fetch mock — lets a test observe the interim "A exportar..." state before resolving. */
function deferredFetch() {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((r) => {
    resolve = r;
  });
  const mock = jest.fn().mockReturnValue(promise);
  global.fetch = mock as unknown as typeof fetch;
  return { mock, resolve };
}

function mockFetchOnce(response: {
  ok: boolean;
  status?: number;
  headers?: Record<string, string>;
  blob?: unknown;
  json?: unknown;
}) {
  const mock = jest.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 201 : 500),
    headers: { get: (name: string) => response.headers?.[name] ?? null },
    blob: async () => response.blob ?? new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    json: async () =>
      response.json ?? {
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' },
      },
  });
  global.fetch = mock as unknown as typeof fetch;
  return mock;
}

describe('ExportResumeButton', () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    URL.revokeObjectURL = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('renders both format buttons with their credit cost shown up front', () => {
    mockFetchOnce({ ok: true });
    renderWithQueryClient(<ExportResumeButton resumeVariantId="variant-1" />);
    expect(screen.getByRole('button', { name: /Exportar PDF — 10 créditos/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Exportar DOCX — 5 créditos/ })).toBeInTheDocument();
  });

  it('selecting PDF calls the export endpoint with format PDF and downloads the returned file', async () => {
    const mock = mockFetchOnce({
      ok: true,
      headers: { 'Content-Disposition': 'attachment; filename="curriculo.pdf"' },
      blob: new Blob(['%PDF-1.7'], { type: 'application/pdf' }),
    });
    renderWithQueryClient(<ExportResumeButton resumeVariantId="variant-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Exportação concluída.'));
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('/exports/resume'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ resumeVariantId: 'variant-1', format: 'PDF' }),
      }),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('selecting DOCX calls the export endpoint with format DOCX', async () => {
    const mock = mockFetchOnce({
      ok: true,
      headers: { 'Content-Disposition': 'attachment; filename="curriculo.docx"' },
      blob: new Blob(['PK'], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    });
    renderWithQueryClient(<ExportResumeButton resumeVariantId="variant-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Exportar DOCX/ }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Exportação concluída.'));
    expect(mock).toHaveBeenCalledWith(
      expect.stringContaining('/exports/resume'),
      expect.objectContaining({
        body: JSON.stringify({ resumeVariantId: 'variant-1', format: 'DOCX' }),
      }),
    );
  });

  it('shows "A exportar..." and disables both buttons while the request is in flight', async () => {
    const { resolve } = deferredFetch();
    renderWithQueryClient(<ExportResumeButton resumeVariantId="variant-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    expect(await screen.findByRole('button', { name: /A exportar/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Exportar DOCX/ })).toBeDisabled();

    resolve({
      ok: true,
      status: 201,
      headers: { get: () => null },
      blob: async () => new Blob(['%PDF-1.7']),
      json: async () => ({ success: true }),
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
  });

  it('shows a generic error toast when generation fails', async () => {
    mockFetchOnce({
      ok: false,
      status: 500,
      json: { success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'boom' } },
    });
    renderWithQueryClient(<ExportResumeButton resumeVariantId="variant-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Não foi possível gerar o ficheiro.'),
    );
  });

  it('shows the insufficient-credits message on a 409 response', async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      json: {
        success: false,
        error: { code: 'CONFLICT', message: 'Insufficient credits for "export_resume_pdf".' },
      },
    });
    renderWithQueryClient(<ExportResumeButton resumeVariantId="variant-1" />);

    fireEvent.click(screen.getByRole('button', { name: /Exportar PDF/ }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Créditos insuficientes para esta exportação.'),
    );
  });
});
