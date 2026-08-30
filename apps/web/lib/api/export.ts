import { useMutation } from '@tanstack/react-query';
import type { ApiResponse } from '@cvlab/types';
import { getAccessToken, ApiError } from '@/lib/api-client';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export type ExportFormat = 'PDF' | 'DOCX';

export interface ExportResumeInput {
  resumeVariantId: string;
  /** Omitted → exports the Variant's current content; given → exports exactly that historical version, never silently the current one. */
  resumeVariantVersionId?: string;
  format: ExportFormat;
}

export interface ExportResumeResult {
  blob: Blob;
  fileName: string;
}

/**
 * Mirrors the backend's `feature_pricing` seed for `export_resume_pdf`/
 * `export_resume_docx` (docs/architecture/export-engine.md §"Credits") —
 * only for the UI label shown before confirming. The actual charge is
 * always computed and enforced server-side by CreditService; this constant
 * is never sent to the API and never trusted as the real cost.
 */
export const EXPORT_COST: Record<ExportFormat, number> = { PDF: 10, DOCX: 5 };

function parseFileName(contentDisposition: string | null, fallback: string): string {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

/**
 * Deliberately bypasses `apiFetch()` — that helper always calls
 * `response.json()`, which would throw on this endpoint's binary PDF/DOCX
 * body (the one binary endpoint in the API; see ExportController). Mirrors
 * apiFetch()'s auth header, credentials, and {success:false,error} handling
 * for everything except the response body itself. The PDF/DOCX bytes are
 * only ever held in memory as a Blob and handed straight to the browser's
 * download flow — never base64-encoded, never persisted client-side.
 */
async function exportResume(input: ExportResumeInput): Promise<ExportResumeResult> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/exports/resume`, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    let message = 'Não foi possível gerar o ficheiro.';
    let code: string | undefined;
    try {
      const body = (await response.json()) as ApiResponse<never>;
      if (!body.success) {
        message = body.error.message;
        code = body.error.code;
      }
    } catch {
      // Error body wasn't JSON (unexpected) — fall back to the generic message above.
    }
    throw new ApiError(message, response.status, code);
  }

  const blob = await response.blob();
  const fallback = input.format === 'PDF' ? 'curriculo.pdf' : 'curriculo.docx';
  const fileName = parseFileName(response.headers.get('Content-Disposition'), fallback);
  return { blob, fileName };
}

/** Triggers the browser's native download for an in-memory Blob — no server round trip, no client-side persistence beyond the download itself. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function useExportResume() {
  return useMutation({ mutationFn: exportResume });
}
