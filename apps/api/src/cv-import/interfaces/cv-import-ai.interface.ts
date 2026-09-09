/**
 * FASE 22 — CV Import AI / Intelligent Extraction Engine
 * (docs/architecture/cv-import-ai.md). This is a second, independent layer
 * on top of the deterministic `CVParser` (cv-parser.ts) — it never
 * re-extracts or replaces anything the parser already found; it only
 * proposes a REVISED value for a field the parser already populated
 * (normalize a job title, tidy a description, split responsibilities from
 * achievements, etc.), or flags a field it cannot confidently improve as
 * `unresolvedFields`. It is never allowed to invent a value for a field the
 * parser left empty — see `getFieldValue()`/`validateCvImportAiSuggestions()`
 * in `cv-import-ai-validator.ts`, which enforce this structurally by
 * dropping any suggestion that doesn't correspond to a real, non-empty
 * existing value.
 */

/** Every top-level area of ExtractedCvData a suggestion can target. */
export type CvImportAiSection =
  | 'personalData'
  | 'summary'
  | 'workExperiences'
  | 'educations'
  | 'skills'
  | 'languages'
  | 'certificates'
  | 'projects'
  | 'awards'
  | 'volunteerExperiences'
  | 'references';

/**
 * One proposed revision to a single field of a single already-extracted
 * entry. `index` is omitted for the two singular sections (`personalData`,
 * `summary`); present (0-based) for the 9 array sections. `originalValue` is
 * always the REAL current value read straight from the CvImport's own
 * `extractedData` — never trusted from the AI's own echo of it (see
 * `validateCvImportAiSuggestions()`), so the review screen's "Original →
 * Sugestão" diff is always grounded in truth even if the model
 * misremembers/paraphrases what it was given.
 */
export interface CvImportAiSuggestion {
  section: CvImportAiSection;
  index?: number;
  field: string;
  originalValue: string;
  suggestedValue: string;
  reason: string;
  /** 0–1, same convention as CvDraftMeta.confidence elsewhere in this module. */
  confidence: number;
}

export interface CvImportAiResult {
  suggestions: CvImportAiSuggestion[];
  /** Human-readable notes on fields the AI could not confidently resolve — advisory only, mirrors CvDraftMeta.warnings' spirit. Never a placeholder for an invented value. */
  unresolvedFields: string[];
}

/** One field eligible for a suggestion — an already-extracted, non-empty value the AI is allowed to propose a revision for. Computed once by the prompt builder (see buildEligibleFields()) and embedded verbatim in the prompt, both for a real model's own targeting and for DummyAIProvider's deterministic response. */
export interface CvImportAiEligibleField {
  section: CvImportAiSection;
  index?: number;
  field: string;
  originalValue: string;
}
