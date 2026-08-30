import { ExportFormat } from '@prisma/client';
import { IsEnum } from 'class-validator';

/** Mirrors CreateExportDto — resumeVariantId comes from the session, never the client. Always exports the Variant's current content (no resumeVariantVersionId option here — the Pipeline always deals with "the current state of this application", not a pinned historical version). */
export class ExportStepDto {
  @IsEnum(ExportFormat)
  format!: ExportFormat;
}
