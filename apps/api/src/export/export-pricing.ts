import type { ExportFormat } from '@prisma/client';

/**
 * `feature_pricing.featureKey` values for Export Engine — deliberately
 * plain strings, NOT part of `AIFeature` (apps/api/src/ai-orchestration/
 * constants/ai-feature.enum.ts): Export never calls a provider or goes
 * through AiOrchestrationService/PromptRegistry, so it has no reason to
 * share that enum. `CreditService.estimate()`/`spend()` key off any string,
 * exactly like AiOrchestrationService's own feature keys do — this is the
 * same mechanism, reused directly, not a parallel one.
 */
export const EXPORT_FEATURE_KEY: Record<ExportFormat, string> = {
  PDF: 'export_resume_pdf',
  DOCX: 'export_resume_docx',
};
