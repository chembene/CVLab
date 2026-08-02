export type SectionType =
  | 'work-experience'
  | 'education'
  | 'skills'
  | 'languages'
  | 'certificates'
  | 'projects'
  | 'courses'
  | 'awards'
  | 'publications'
  | 'volunteer-experience'
  | 'references';

export interface SectionDefinition {
  /** PrismaClient property name for this section's model delegate. */
  delegate: string;
  /** History-event / log label, e.g. "work_experience". */
  entityType: string;
  /**
   * Field(s) that together must be unique (case-insensitive) among a
   * resume's active rows. Only set where the brief requires it: "No
   * duplicated skills. No duplicated certificates. No duplicated
   * education." — the other 8 section types have no such rule (e.g. two
   * roles at the same company is entirely valid work experience).
   */
  duplicateCheckFields?: string[];
  /**
   * Fields typed `@db.Date` in prisma/schema.prisma. DTOs validate these as
   * ISO date strings (@IsDateString), but Prisma's client rejects a bare
   * "YYYY-MM-DD" string for a DateTime column ("premature end of input") —
   * they must be converted to real Date objects before reaching Prisma. See
   * ResumeSectionsRepository.normalizeDates.
   */
  dateFields?: string[];
}

/**
 * All 11 resume sections share an identical CRUD shape (id, resumeId,
 * displayOrder, timestamps, soft-delete) and identical authorization/
 * history/completion-recalculation rules — see ResumeSectionsService. This
 * registry plus that one generic service is what keeps 11 near-identical
 * resources from becoming 11 near-identical repository/service classes.
 */
export const SECTION_DEFINITIONS: Record<SectionType, SectionDefinition> = {
  'work-experience': {
    delegate: 'workExperience',
    entityType: 'work_experience',
    dateFields: ['startDate', 'endDate'],
  },
  education: {
    delegate: 'education',
    entityType: 'education',
    duplicateCheckFields: ['institution', 'degree'],
    dateFields: ['startDate', 'endDate'],
  },
  skills: { delegate: 'skill', entityType: 'skill', duplicateCheckFields: ['name'] },
  languages: { delegate: 'language', entityType: 'language' },
  certificates: {
    delegate: 'certificate',
    entityType: 'certificate',
    duplicateCheckFields: ['title', 'issuer'],
    dateFields: ['issueDate', 'expirationDate'],
  },
  projects: { delegate: 'project', entityType: 'project' },
  courses: { delegate: 'course', entityType: 'course', dateFields: ['completionDate'] },
  awards: { delegate: 'award', entityType: 'award', dateFields: ['dateAwarded'] },
  publications: {
    delegate: 'publication',
    entityType: 'publication',
    dateFields: ['publicationDate'],
  },
  'volunteer-experience': {
    delegate: 'volunteerExperience',
    entityType: 'volunteer_experience',
    dateFields: ['startDate', 'endDate'],
  },
  references: { delegate: 'reference', entityType: 'reference' },
};
