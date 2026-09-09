import type { ExtractedCvData } from './interfaces/extracted-cv-data.interface';
import type {
  CvImportAiEligibleField,
  CvImportAiSection,
  CvImportAiSuggestion,
} from './interfaces/cv-import-ai.interface';

/**
 * Every string-valued field of each section the AI is ever allowed to
 * target — deliberately excludes non-string fields (currentlyWorking,
 * confidence, warnings, mergeDecision, ...) and identifiers. Shared by
 * `buildEligibleFields()` (what the prompt tells the model it may touch) and
 * `getFieldValue()`/`validateCvImportAiSuggestions()` (what the service
 * actually trusts) — one single source of truth, so a field can never be
 * "suggestible" in the prompt but silently rejected at validation time or
 * vice versa.
 */
const FIELD_KEYS_BY_SECTION: Record<
  Exclude<CvImportAiSection, 'personalData' | 'summary'>,
  string[]
> = {
  workExperiences: ['company', 'position', 'location', 'startDate', 'endDate', 'description'],
  educations: ['institution', 'degree', 'field', 'startDate', 'endDate', 'description'],
  skills: ['name'],
  languages: ['language', 'proficiency'],
  certificates: ['title', 'issuer', 'issueDate'],
  projects: ['title', 'description', 'url'],
  awards: ['title', 'issuer', 'dateAwarded', 'description'],
  volunteerExperiences: ['organization', 'role', 'startDate', 'endDate', 'description'],
  references: ['name', 'position', 'company', 'email', 'phone'],
};

const PERSONAL_DATA_FIELDS = [
  'fullName',
  'email',
  'phone',
  'country',
  'city',
  'address',
  'linkedin',
  'github',
  'portfolio',
  'website',
];

/** The real, current value of one field — always the ground truth the review screen and the validator trust, never the AI's own echo of it. Returns undefined when the field doesn't exist, the index is out of range, or the value is empty/not a string. */
export function getFieldValue(
  data: ExtractedCvData,
  section: CvImportAiSection,
  index: number | undefined,
  field: string,
): string | undefined {
  let raw: unknown;
  if (section === 'personalData') {
    if (!PERSONAL_DATA_FIELDS.includes(field)) return undefined;
    raw = (data.personalData as Record<string, unknown>)[field];
  } else if (section === 'summary') {
    raw = field === 'summary' ? data.summary : undefined;
  } else {
    const allowedFields = FIELD_KEYS_BY_SECTION[section];
    if (!allowedFields?.includes(field) || index === undefined) return undefined;
    const entry = (data[section] as Record<string, unknown>[] | undefined)?.[index];
    raw = entry ? entry[field] : undefined;
  }
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : undefined;
}

/** Every already-extracted, non-empty field across the whole draft — what the prompt tells the model (and DummyAIProvider) it's allowed to propose a revision for. Order is deterministic (section declaration order, then array index, then field declaration order) so the same draft always produces the same eligible-fields list. */
export function buildEligibleFields(data: ExtractedCvData): CvImportAiEligibleField[] {
  const fields: CvImportAiEligibleField[] = [];

  for (const field of PERSONAL_DATA_FIELDS) {
    const value = getFieldValue(data, 'personalData', undefined, field);
    if (value) fields.push({ section: 'personalData', field, originalValue: value });
  }
  const summaryValue = getFieldValue(data, 'summary', undefined, 'summary');
  if (summaryValue)
    fields.push({ section: 'summary', field: 'summary', originalValue: summaryValue });

  for (const section of Object.keys(
    FIELD_KEYS_BY_SECTION,
  ) as (keyof typeof FIELD_KEYS_BY_SECTION)[]) {
    const entries = data[section] as Record<string, unknown>[] | undefined;
    entries?.forEach((_entry, index) => {
      for (const field of FIELD_KEYS_BY_SECTION[section]!) {
        const value = getFieldValue(data, section, index, field);
        if (value) fields.push({ section, index, field, originalValue: value });
      }
    });
  }

  return fields;
}

/**
 * Cross-checks every AI-returned suggestion against the real draft — drops
 * (never throws for) a suggestion whose section/index/field doesn't
 * correspond to a real, currently non-empty value, and always substitutes
 * the REAL current value as `originalValue` rather than trusting the AI's
 * own echo of it (a real model can slightly paraphrase what it was given;
 * the review screen's "Original" side must never be anything other than
 * ground truth). This is the structural enforcement of CLAUDE.md's "AI must
 * never invent" rule for this feature: a suggestion can only ever revise
 * something the deterministic parser actually found, never originate a
 * value for an empty field.
 */
export function validateCvImportAiSuggestions(
  data: ExtractedCvData,
  suggestions: CvImportAiSuggestion[],
): CvImportAiSuggestion[] {
  const validated: CvImportAiSuggestion[] = [];
  for (const suggestion of suggestions) {
    const realValue = getFieldValue(data, suggestion.section, suggestion.index, suggestion.field);
    if (realValue === undefined) continue;
    validated.push({ ...suggestion, originalValue: realValue });
  }
  return validated;
}
