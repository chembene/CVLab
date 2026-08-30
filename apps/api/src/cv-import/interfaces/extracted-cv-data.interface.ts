/**
 * The shape CVParser extracts a CV into, and the shape ConfirmCvImportDto
 * accepts back once the user has reviewed/edited the preview. Field names
 * intentionally mirror MasterResume/Profile/section columns
 * (apps/api/src/master-resume, apps/api/src/resume-sections) so
 * CVImportService.confirm() can map them 1:1 without a translation layer.
 */
export interface ExtractedPersonalData {
  fullName?: string;
  email?: string;
  phone?: string;
  country?: string;
  city?: string;
  address?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  website?: string;
}

export type CvMergeDecision = 'use_imported' | 'keep_existing' | 'merge';

/**
 * FASE 7 audit (2026-08-12) — optional per-entry conflict resolution the
 * review screen attaches to an entry that `GET /cv-import/:id/merge-preview`
 * flagged as `possible_duplicate` against an existing Master Resume
 * (`cv-import-merge-analyzer.ts`'s `MergeEntryResult.existingId`). The two
 * fields only mean something together: `existingSectionId` names WHICH
 * existing row the decision applies to, `mergeDecision` says what to do
 * with it. Every `Extracted*` entity below carries this pair so the review
 * screen can send its "Existente vs Importado" choices straight back inside
 * the same edited array `confirm()` already expects — no separate
 * resolutions payload.
 *
 *  - Both fields absent (every entry that was never flagged as a possible
 *    duplicate, or one the user never explicitly resolved): unchanged
 *    pre-FASE-7 behavior — `confirm()` creates a new row (and the
 *    database's own exact-duplicate check, where one applies, still skips
 *    an exact repeat).
 *  - `'keep_existing'`: skip creating anything for this entry — the
 *    existing row is left untouched.
 *  - `'use_imported'`: update the existing row's fields with the imported
 *    entry's values, instead of creating a second, near-duplicate row.
 *  - `'merge'`: update the existing row with a deterministic fill-gaps
 *    merge (an existing field is kept only where the imported entry's
 *    matching field is empty/undefined) — never an AI-authored rewrite,
 *    consistent with CLAUDE.md's "AI must never invent" rule (no AI is
 *    involved here at all).
 */
export interface CvMergeResolution {
  mergeDecision?: CvMergeDecision;
  existingSectionId?: string;
}

/**
 * FASE 5 audit (2026-08-12) — "StructuredResumeDraft": per-entry provenance
 * metadata, computed deterministically by `CVParser` (no AI anywhere in this
 * module — CLAUDE.md's "AI must never invent" applies to the extraction
 * itself, not just downstream). Design decision, documented here because
 * it's a deliberate departure from the brief's literal
 * `{ value, confidence, source, sourceText, warnings }` wrapper shape:
 * rather than introducing a SEPARATE parallel structure (which would need
 * its own index-alignment bookkeeping every time the user edits/reorders/
 * removes an entry in the review screen — the exact fragility
 * `cv-import-merge-analyzer.ts`'s `existingId`/`existing` fields already
 * had to solve for FASE 7's diff banner), these four fields are baked
 * directly onto each `Extracted*` entity. The entry itself already plays
 * the `value` role; `confidence`/`source`/`sourceText`/`warnings` travel
 * alongside it as a few more optional properties — same mechanism already
 * proven safe by `CvMergeResolution` above. This is strictly additive:
 * every existing caller (merge-analyzer, `confirm()`, the review UI's
 * existing field editors) that never reads these four keys is completely
 * unaffected, and nothing here changes `ExtractedCvData`'s shape as
 * `confirm()`'s payload contract.
 *
 *  - `confidence` (0–1): how reliably this entry's data reflects the source
 *    document, from REAL parser signals only — never a fabricated number.
 *    See `cv-parser.ts`'s `score*()` helpers for the exact, disclosed
 *    criteria per section type (recognized header + required fields present
 *    → high; some fields missing → medium; recovered via
 *    `parseFallbackDatedEntries()` with no recognized header at all →
 *    capped low).
 *  - `source`: `'document'` when derived from a recognized, structured
 *    section; `'fallback'` when recovered via best-effort date-anchored
 *    recovery from text that had no recognized section header.
 *  - `sourceText`: the raw text (capped ~240 chars) this entry's chunk was
 *    parsed from, for the review screen's "Fonte: ..." quote. Undefined
 *    when there's no richer context than the value itself (e.g. a single
 *    skill token) — never fabricated.
 *  - `warnings`: human-readable notes about a missing or ambiguous field on
 *    THIS entry specifically — advisory only, never blocks confirmation.
 */
export interface CvDraftMeta {
  confidence?: number;
  source?: 'document' | 'fallback';
  sourceText?: string;
  warnings?: string[];
}

export interface ExtractedWorkExperience extends CvMergeResolution, CvDraftMeta {
  company?: string;
  position?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  currentlyWorking?: boolean;
  description?: string;
}

export interface ExtractedEducation extends CvMergeResolution, CvDraftMeta {
  institution?: string;
  degree?: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

export interface ExtractedSkill extends CvMergeResolution, CvDraftMeta {
  name: string;
}

export interface ExtractedLanguage extends CvMergeResolution, CvDraftMeta {
  language: string;
  proficiency?: string;
}

export interface ExtractedCertificate extends CvMergeResolution, CvDraftMeta {
  title?: string;
  issuer?: string;
  issueDate?: string;
}

export interface ExtractedProject extends CvMergeResolution, CvDraftMeta {
  title?: string;
  description?: string;
  url?: string;
}

/** Phase 12 canonical-model addition — mirrors the Award Prisma model (schema.prisma). */
export interface ExtractedAward extends CvMergeResolution, CvDraftMeta {
  title?: string;
  issuer?: string;
  dateAwarded?: string;
  description?: string;
}

/** Phase 12 canonical-model addition — mirrors the VolunteerExperience Prisma model. */
export interface ExtractedVolunteerExperience extends CvMergeResolution, CvDraftMeta {
  organization?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  currentlyVolunteering?: boolean;
  description?: string;
}

/**
 * Phase 12 canonical-model addition — mirrors the Reference Prisma model.
 * Per the brief: "only if explicitly present in the source document" — the
 * parser never fabricates a reference; this section is only ever populated
 * from an actual "Referências"/"References" block with real names.
 */
export interface ExtractedReference extends CvMergeResolution, CvDraftMeta {
  name?: string;
  position?: string;
  company?: string;
  email?: string;
  phone?: string;
}

export interface ExtractedCvData {
  personalData: ExtractedPersonalData;
  summary?: string;
  workExperiences: ExtractedWorkExperience[];
  educations: ExtractedEducation[];
  skills: ExtractedSkill[];
  languages: ExtractedLanguage[];
  certificates: ExtractedCertificate[];
  projects: ExtractedProject[];
  awards: ExtractedAward[];
  volunteerExperiences: ExtractedVolunteerExperience[];
  references: ExtractedReference[];
}

/**
 * FASE 5 audit — named alias for the brief's "StructuredResumeDraft"
 * concept. Identical to `ExtractedCvData` at the type level (see
 * `CvDraftMeta`'s doc comment for why the per-entry metadata is baked into
 * each entity rather than a separate wrapper) — used at call sites that are
 * specifically about the reviewable draft (e.g. the upload/getOne response)
 * to make that intent explicit in the code, distinct from a plain
 * `ExtractedCvData` used purely as the confirm() payload shape.
 */
export type StructuredResumeDraft = ExtractedCvData;

/**
 * Confidence per top-level field, 0-1, keyed by dotted path (e.g.
 * "personalData.email", "workExperiences"). Missing key means "nothing was
 * found for this field" — the frontend preview treats an absent key the
 * same as confidence 0.
 */
export type CvFieldConfidence = Record<string, number>;

export interface CvParseResult {
  data: ExtractedCvData;
  confidence: CvFieldConfidence;
  rawText: string;
}
