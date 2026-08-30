import type {
  ExtractedAward,
  ExtractedCertificate,
  ExtractedCvData,
  ExtractedEducation,
  ExtractedLanguage,
  ExtractedProject,
  ExtractedReference,
  ExtractedSkill,
  ExtractedVolunteerExperience,
  ExtractedWorkExperience,
} from './interfaces/extracted-cv-data.interface';

/**
 * Phase 12, brief §14 "Merge Engine". Deterministic, normalized-string
 * equality only — deliberately NOT a fuzzy/similarity matcher ("Do not use
 * an unreliable fuzzy matcher as the sole decision maker"). A row is
 * flagged `possible_duplicate` only when its comparison fields match an
 * existing section row exactly after normalization (case-insensitive,
 * whitespace-collapsed) — never a probabilistic guess. This intentionally
 * trades recall (a duplicate phrased differently won't be caught) for
 * precision (never falsely flags two genuinely different entries) — the
 * mandatory review screen is still the user's final say either way.
 */

export interface MergeEntryResult<T> {
  entry: T;
  status: 'new' | 'possible_duplicate';
  /**
   * FASE 7 audit (2026-08-12) — only set when status is 'possible_duplicate':
   * the matched existing section row's id. `CvImportService.confirm()` needs
   * this to `update()` the existing row instead of creating a new one when
   * the user resolves the conflict as 'use_imported'/'merge' (see
   * `ExtractedCvData`'s `existingSectionId`/`mergeDecision` fields).
   */
  existingId?: string;
  /**
   * FASE 7 audit — only set when status is 'possible_duplicate': the matched
   * existing row, projected into the exact same shape as `entry`, so the
   * review screen can render an "Existente vs Importado" diff without a
   * second round-trip to fetch the existing row's fields separately.
   */
  existing?: T;
}

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

/** Minimal shape needed from each existing section row — matches ResumeSectionsRepository's generic SectionRecord. */
export type ExistingSectionRow = Record<string, unknown>;

export interface ExistingSections {
  workExperiences: ExistingSectionRow[];
  educations: ExistingSectionRow[];
  skills: ExistingSectionRow[];
  languages: ExistingSectionRow[];
  certificates: ExistingSectionRow[];
  projects: ExistingSectionRow[];
  awards: ExistingSectionRow[];
  volunteerExperiences: ExistingSectionRow[];
  references: ExistingSectionRow[];
}

function normalize(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function str(row: ExistingSectionRow, field: string): string {
  const value = row[field];
  return typeof value === 'string' ? value : '';
}

/** A DB section row's string field, or undefined for an empty/missing value — matches how the Extracted* interfaces represent "not present" (never an empty string). */
function optStr(row: ExistingSectionRow, field: string): string | undefined {
  const value = row[field];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** A DB section row's date field. Prisma returns a real `Date` for every `DateTime` column, unlike the Extracted* interfaces' plain ISO-date strings — normalized here to the same "YYYY-MM-DD" shape so the diff UI can compare/display them consistently. */
function optDateStr(row: ExistingSectionRow, field: string): string | undefined {
  const value = row[field];
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optBool(row: ExistingSectionRow, field: string): boolean | undefined {
  const value = row[field];
  return typeof value === 'boolean' ? value : undefined;
}

function rowId(row: ExistingSectionRow): string | undefined {
  const value = row.id;
  return typeof value === 'string' ? value : undefined;
}

const projectWorkExperience = (row: ExistingSectionRow): ExtractedWorkExperience => ({
  company: optStr(row, 'company'),
  position: optStr(row, 'position'),
  location: optStr(row, 'location'),
  startDate: optDateStr(row, 'startDate'),
  endDate: optDateStr(row, 'endDate'),
  currentlyWorking: optBool(row, 'currentlyWorking'),
  description: optStr(row, 'description'),
});

const projectEducation = (row: ExistingSectionRow): ExtractedEducation => ({
  institution: optStr(row, 'institution'),
  degree: optStr(row, 'degree'),
  field: optStr(row, 'field'),
  startDate: optDateStr(row, 'startDate'),
  endDate: optDateStr(row, 'endDate'),
  description: optStr(row, 'description'),
});

const projectSkill = (row: ExistingSectionRow): ExtractedSkill => ({
  name: optStr(row, 'name') ?? '',
});

const projectLanguage = (row: ExistingSectionRow): ExtractedLanguage => ({
  language: optStr(row, 'language') ?? '',
  proficiency: optStr(row, 'proficiency'),
});

const projectCertificate = (row: ExistingSectionRow): ExtractedCertificate => ({
  title: optStr(row, 'title'),
  issuer: optStr(row, 'issuer'),
  issueDate: optDateStr(row, 'issueDate'),
});

const projectProject = (row: ExistingSectionRow): ExtractedProject => ({
  title: optStr(row, 'title'),
  description: optStr(row, 'description'),
  url: optStr(row, 'url'),
});

const projectAward = (row: ExistingSectionRow): ExtractedAward => ({
  title: optStr(row, 'title'),
  issuer: optStr(row, 'issuer'),
  dateAwarded: optDateStr(row, 'dateAwarded'),
  description: optStr(row, 'description'),
});

const projectVolunteerExperience = (row: ExistingSectionRow): ExtractedVolunteerExperience => ({
  organization: optStr(row, 'organization'),
  role: optStr(row, 'role'),
  startDate: optDateStr(row, 'startDate'),
  endDate: optDateStr(row, 'endDate'),
  currentlyVolunteering: optBool(row, 'currentlyVolunteering'),
  description: optStr(row, 'description'),
});

const projectReference = (row: ExistingSectionRow): ExtractedReference => ({
  name: optStr(row, 'name'),
  position: optStr(row, 'position'),
  company: optStr(row, 'company'),
  email: optStr(row, 'email'),
  phone: optStr(row, 'phone'),
});

function classify<T>(
  entries: T[],
  existing: ExistingSectionRow[],
  matches: (entry: T, existingRow: ExistingSectionRow) => boolean,
  project: (row: ExistingSectionRow) => T,
): MergeEntryResult<T>[] {
  return entries.map((entry) => {
    const matchedRow = existing.find((row) => matches(entry, row));
    if (!matchedRow) {
      return { entry, status: 'new' };
    }
    return {
      entry,
      status: 'possible_duplicate',
      existingId: rowId(matchedRow),
      existing: project(matchedRow),
    };
  });
}

export function analyzeMerge(data: ExtractedCvData, existing: ExistingSections): MergePreview {
  const workExperiences = classify(
    data.workExperiences,
    existing.workExperiences,
    (e, row) =>
      normalize(e.company) === normalize(str(row, 'company')) &&
      normalize(e.position) === normalize(str(row, 'position')),
    projectWorkExperience,
  );
  const educations = classify(
    data.educations,
    existing.educations,
    (e, row) =>
      normalize(e.institution) === normalize(str(row, 'institution')) &&
      normalize(e.degree) === normalize(str(row, 'degree')),
    projectEducation,
  );
  const skills = classify(
    data.skills,
    existing.skills,
    (e, row) => normalize(e.name) === normalize(str(row, 'name')),
    projectSkill,
  );
  const languages = classify(
    data.languages,
    existing.languages,
    (e, row) => normalize(e.language) === normalize(str(row, 'language')),
    projectLanguage,
  );
  const certificates = classify(
    data.certificates,
    existing.certificates,
    (e, row) =>
      normalize(e.title) === normalize(str(row, 'title')) &&
      normalize(e.issuer) === normalize(str(row, 'issuer')),
    projectCertificate,
  );
  const projects = classify(
    data.projects,
    existing.projects,
    (e, row) => normalize(e.title) === normalize(str(row, 'title')),
    projectProject,
  );
  const awards = classify(
    data.awards,
    existing.awards,
    (e, row) => normalize(e.title) === normalize(str(row, 'title')),
    projectAward,
  );
  const volunteerExperiences = classify(
    data.volunteerExperiences,
    existing.volunteerExperiences,
    (e, row) =>
      normalize(e.organization) === normalize(str(row, 'organization')) &&
      normalize(e.role) === normalize(str(row, 'role')),
    projectVolunteerExperience,
  );
  const references = classify(
    data.references,
    existing.references,
    (e, row) => normalize(e.name) === normalize(str(row, 'name')),
    projectReference,
  );

  const all = [
    ...workExperiences,
    ...educations,
    ...skills,
    ...languages,
    ...certificates,
    ...projects,
    ...awards,
    ...volunteerExperiences,
    ...references,
  ];

  return {
    workExperiences,
    educations,
    skills,
    languages,
    certificates,
    projects,
    awards,
    volunteerExperiences,
    references,
    newCount: all.filter((r) => r.status === 'new').length,
    duplicateCount: all.filter((r) => r.status === 'possible_duplicate').length,
  };
}
