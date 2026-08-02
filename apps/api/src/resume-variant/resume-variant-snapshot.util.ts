import type { SectionRecord } from '../resume-sections/resume-sections.repository';
import type { SectionType } from '../resume-sections/section-registry';

/** Maps each of the 11 SectionTypes to the content key used inside a Variant's `content` snapshot — mirrors MasterResume's own relation field names. */
export const SECTION_TYPE_TO_CONTENT_KEY: Record<SectionType, string> = {
  'work-experience': 'workExperiences',
  education: 'educations',
  skills: 'skills',
  languages: 'languages',
  certificates: 'certificates',
  projects: 'projects',
  courses: 'courses',
  awards: 'awards',
  publications: 'publications',
  'volunteer-experience': 'volunteerExperiences',
  references: 'references',
};

const OMITTED_SNAPSHOT_KEYS = ['id', 'resumeId', 'createdAt', 'updatedAt', 'deletedAt'] as const;

/**
 * Strips DB/identity metadata a snapshot shouldn't carry — `id`/`resumeId`
 * point at the live section row this was copied from, which is meaningless
 * (and misleading) once the Variant is independent. `displayOrder` and every
 * content field are kept.
 */
export function toSnapshotSection(record: SectionRecord): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...record };
  for (const key of OMITTED_SNAPSHOT_KEYS) {
    delete copy[key];
  }
  return copy;
}
