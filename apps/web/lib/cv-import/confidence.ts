import type { CvFieldConfidence } from '@/lib/api/cv-import';

export type ConfidenceTier = 'high' | 'medium' | 'low';

/**
 * CVParser (apps/api/src/cv-import/cv-parser.ts) only computes a confidence
 * score for the 6 personalData.* fields it regex-extracts — array sections
 * (workExperiences, educations, skills, ...) and summary are never scored,
 * because they come from deterministic section-header parsing, not a
 * single matched value. This function (and the review screen) deliberately
 * never fabricates a confidence badge for a key that isn't in the map —
 * "avoid fake precision" applies to the UI just as much as to the parser.
 */
export function getConfidenceTier(
  confidence: CvFieldConfidence | null | undefined,
  key: string,
): ConfidenceTier {
  const value = confidence?.[key];
  if (value == null) return 'low';
  if (value >= 0.8) return 'high';
  if (value >= 0.5) return 'medium';
  return 'low';
}

export function hasConfidenceScore(
  confidence: CvFieldConfidence | null | undefined,
  key: string,
): boolean {
  return confidence?.[key] != null;
}

/**
 * FASE 5 audit (2026-08-12) — same tier bands as `getConfidenceTier()`
 * above, applied to a per-entry `CvDraftMeta.confidence` value (e.g.
 * `workExperiences[i].confidence`) rather than the old bulk, per-array
 * `CvFieldConfidence` score. `undefined` (an entry with no computed score
 * at all — the honest state for one the user added manually via "+
 * Adicionar", never a parser-produced one) returns `undefined`, never a
 * fabricated tier.
 */
export function getEntryConfidenceTier(confidence: number | undefined): ConfidenceTier | undefined {
  if (confidence == null) return undefined;
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}
