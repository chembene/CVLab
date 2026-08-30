import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api-client';
import type { MasterResume } from './master-resume';

/**
 * Mirrors apps/api/src/cv-import/interfaces/extracted-cv-data.interface.ts —
 * field names intentionally match Profile/MasterResume/section columns so
 * the review screen can send the (possibly-edited) object straight back as
 * the confirm() body with no translation layer.
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

/** FASE 7 audit (2026-08-12) — mirrors apps/api's CvMergeDecision/CvMergeResolution. */
export type CvMergeDecision = 'use_imported' | 'keep_existing' | 'merge';

/**
 * Per-entry conflict resolution the review screen attaches to an entry
 * `useMergePreview()` flagged as `possible_duplicate` (see
 * `MergeEntryResult.existingId` below), sent straight back inside the same
 * edited array `confirm()` already expects — no separate payload. Both
 * fields absent (the default) means "create as a new entry," unchanged from
 * pre-FASE-7 behavior.
 */
export interface CvMergeResolution {
  mergeDecision?: CvMergeDecision;
  existingSectionId?: string;
}

/**
 * FASE 5 audit (2026-08-12) — mirrors apps/api's `CvDraftMeta`. Per-entry
 * provenance the review screen renders (confidence badge, source, "Fonte:
 * ..." quote, warnings) — computed deterministically by the backend parser,
 * never by AI. Baked directly onto each entity (same mechanism as
 * `CvMergeResolution` above) rather than a separate wrapper, so it survives
 * the user editing/reordering/removing entries without extra bookkeeping.
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

/** Phase 12 canonical-model addition — mirrors apps/api's ExtractedAward. */
export interface ExtractedAward extends CvMergeResolution, CvDraftMeta {
  title?: string;
  issuer?: string;
  dateAwarded?: string;
  description?: string;
}

/** Phase 12 canonical-model addition — mirrors apps/api's ExtractedVolunteerExperience. */
export interface ExtractedVolunteerExperience extends CvMergeResolution, CvDraftMeta {
  organization?: string;
  role?: string;
  startDate?: string;
  endDate?: string;
  currentlyVolunteering?: boolean;
  description?: string;
}

/** Phase 12 canonical-model addition — only ever populated when explicitly present in the source document (never fabricated). */
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

/** Phase 12, brief §13/§35 — explicit user choice when a Master Resume already exists. Defaults to 'merge' server-side when omitted. */
export type CvImportStrategy = 'merge' | 'replace';

/**
 * Phase 12, brief §14 — one entry's deterministic (no AI) duplicate
 * classification. FASE 7 audit (2026-08-12) added `existingId`/`existing`:
 * only set when `status` is `'possible_duplicate'` — the matched existing
 * section row's id and its fields (projected into the same shape as
 * `entry`), letting the review screen render an "Existente vs Importado"
 * diff without a second round-trip.
 */
export interface MergeEntryResult<T> {
  entry: T;
  status: 'new' | 'possible_duplicate';
  existingId?: string;
  existing?: T;
}

/** Phase 12, brief §14/§15 — computed before the user commits, via GET /cv-import/:id/merge-preview. */
export interface MergePreview {
  workExperiences: MergeEntryResult<ExtractedWorkExperience>[];
  educations: MergeEntryResult<ExtractedEducation>[];
  skills: MergeEntryResult<ExtractedSkill>[];
  languages: MergeEntryResult<ExtractedLanguage>[];
  certificates: MergeEntryResult<ExtractedCertificate>[];
  projects: MergeEntryResult<ExtractedProject>[];
  awards: MergeEntryResult<ExtractedAward>[];
  volunteerExperiences: MergeEntryResult<ExtractedVolunteerExperience>[];
  references: MergeEntryResult<ExtractedReference>[];
  newCount: number;
  duplicateCount: number;
}

/** Confidence per top-level field, 0-1, keyed by dotted path (e.g. "personalData.email"). Missing key = nothing found. */
export type CvFieldConfidence = Record<string, number>;

export type CvImportStatus = 'PENDING' | 'EXTRACTED' | 'CONFIRMED' | 'DISCARDED' | 'FAILED';
export type CvFileType = 'PDF' | 'DOCX';

export interface CvImport {
  id: string;
  userId: string;
  fileName: string;
  fileType: CvFileType;
  fileSizeBytes: number;
  status: CvImportStatus;
  rawTextExcerpt?: string | null;
  extractedData?: ExtractedCvData | null;
  fieldConfidence?: CvFieldConfidence | null;
  creditsUsed: number;
  masterResumeId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ConfirmCvImportResult {
  masterResume: MasterResume;
  skippedEntries: string[];
  /** FASE 7 audit — entries resolved as `mergeDecision: 'keep_existing'`; the existing row was left untouched. */
  keptExistingEntries: string[];
  /** FASE 7 audit — entries resolved as `mergeDecision: 'use_imported'`/`'merge'`; the matched existing row was updated in place. */
  updatedEntries: string[];
}

export function useCvImports() {
  return useQuery({ queryKey: ['cv-imports'], queryFn: () => apiFetch<CvImport[]>('/cv-import') });
}

export function useCvImport(id: string | undefined) {
  return useQuery({
    queryKey: ['cv-imports', id],
    queryFn: () => apiFetch<CvImport>(`/cv-import/${id}`),
    enabled: Boolean(id),
  });
}

/** Multipart upload — apiFetch already special-cases a FormData body (no Content-Type header, no JSON.stringify). */
export function useUploadCvImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append('file', file);
      return apiFetch<CvImport>('/cv-import/upload', { method: 'POST', body });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cv-imports'] }),
  });
}

export type ConfirmCvImportInput = Partial<ExtractedCvData> & { strategy?: CvImportStrategy };

export function useConfirmCvImport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ConfirmCvImportInput) =>
      apiFetch<ConfirmCvImportResult>(`/cv-import/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cv-imports'] });
      queryClient.invalidateQueries({ queryKey: ['master-resume'] });
    },
  });
}

/** Phase 12, brief §14/§15 — read-only, computed before the user commits. */
export function useMergePreview(id: string | undefined) {
  return useQuery({
    queryKey: ['cv-imports', id, 'merge-preview'],
    queryFn: () => apiFetch<MergePreview>(`/cv-import/${id}/merge-preview`),
    enabled: Boolean(id),
  });
}

export function useDiscardCvImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<CvImport>(`/cv-import/${id}/discard`, { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cv-imports'] }),
  });
}

export function useDeleteCvImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<void>(`/cv-import/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cv-imports'] }),
  });
}
