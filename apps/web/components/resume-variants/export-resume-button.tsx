'use client';

import { FileText, FileType } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { downloadBlob, EXPORT_COST, useExportResume, type ExportFormat } from '@/lib/api/export';
import { ApiError } from '@/lib/api-client';

export interface ExportResumeButtonProps {
  resumeVariantId: string;
  /** Omitted → exports the current content. Set only when exporting a specific historical version (Version Timeline "Export this version"). */
  resumeVariantVersionId?: string;
}

/**
 * "Exportar PDF" / "Exportar DOCX" — per docs/architecture/export-engine.md.
 * Generation happens server-side (headless Chromium for PDF, the `docx`
 * library for DOCX); the browser only ever receives the finished file as a
 * Blob and hands it straight to the OS download flow — nothing is stored
 * client-side and the bytes are never base64-encoded. Two plain, always-
 * visible buttons rather than a dropdown, so the cost of each format is
 * visible up front without an extra click.
 */
export function ExportResumeButton({
  resumeVariantId,
  resumeVariantVersionId,
}: ExportResumeButtonProps) {
  const exportResume = useExportResume();
  const pendingFormat = exportResume.isPending ? exportResume.variables?.format : undefined;

  async function handleExport(format: ExportFormat) {
    if (exportResume.isPending) return; // belt-and-braces against a double-click racing the request
    try {
      const { blob, fileName } = await exportResume.mutateAsync({
        resumeVariantId,
        resumeVariantVersionId,
        format,
      });
      downloadBlob(blob, fileName);
      toast.success('Exportação concluída.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error('Créditos insuficientes para esta exportação.');
      } else {
        toast.error('Não foi possível gerar o ficheiro.');
      }
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => handleExport('PDF')}
        disabled={exportResume.isPending}
        loading={pendingFormat === 'PDF'}
      >
        <FileText className="h-4 w-4" />
        {pendingFormat === 'PDF' ? 'A exportar...' : `Exportar PDF — ${EXPORT_COST.PDF} créditos`}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => handleExport('DOCX')}
        disabled={exportResume.isPending}
        loading={pendingFormat === 'DOCX'}
      >
        <FileType className="h-4 w-4" />
        {pendingFormat === 'DOCX'
          ? 'A exportar...'
          : `Exportar DOCX — ${EXPORT_COST.DOCX} créditos`}
      </Button>
    </div>
  );
}
