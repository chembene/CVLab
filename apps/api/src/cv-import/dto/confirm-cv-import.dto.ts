import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import type {
  ExtractedAward,
  ExtractedCertificate,
  ExtractedEducation,
  ExtractedLanguage,
  ExtractedPersonalData,
  ExtractedProject,
  ExtractedReference,
  ExtractedSkill,
  ExtractedVolunteerExperience,
  ExtractedWorkExperience,
} from '../interfaces/extracted-cv-data.interface';

/**
 * Phase 12 — explicit user choice when a Master Resume already exists
 * (brief §13/§35: "Never automatically replace it. Ask the user."):
 *  - 'merge' (default, backward-compatible with pre-Phase-12 behavior): keep
 *    every existing section row, add the imported ones, silently skip an
 *    exact duplicate (same behavior confirm() already had).
 *  - 'replace': soft-delete every existing section row first, then import
 *    fresh — a real "start over" option, only ever taken on explicit user
 *    request, never automatically.
 */
export type CvImportStrategy = 'merge' | 'replace';

/**
 * The user-reviewed, possibly-edited version of the preview returned by
 * upload(). Every field is optional and, when present, entirely replaces
 * the corresponding parsed field — the frontend preview page is expected to
 * always send back the full edited object it showed the user (not a
 * partial patch), matching "Preview → User confirms" from this phase's
 * brief. Deliberately loosely-typed (unlike the section DTOs' per-field
 * validators) because this payload's shape mirrors 7 different section
 * entities at once; CVImportService.confirm() re-validates the fields that
 * matter (required columns) before writing to Prisma.
 */
export class ConfirmCvImportDto {
  @IsOptional()
  @IsObject()
  personalData?: ExtractedPersonalData;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsObject({ each: true })
  workExperiences?: ExtractedWorkExperience[];

  @IsOptional()
  @IsObject({ each: true })
  educations?: ExtractedEducation[];

  @IsOptional()
  @IsObject({ each: true })
  skills?: ExtractedSkill[];

  @IsOptional()
  @IsObject({ each: true })
  languages?: ExtractedLanguage[];

  @IsOptional()
  @IsObject({ each: true })
  certificates?: ExtractedCertificate[];

  @IsOptional()
  @IsObject({ each: true })
  projects?: ExtractedProject[];

  @IsOptional()
  @IsObject({ each: true })
  awards?: ExtractedAward[];

  @IsOptional()
  @IsObject({ each: true })
  volunteerExperiences?: ExtractedVolunteerExperience[];

  @IsOptional()
  @IsObject({ each: true })
  references?: ExtractedReference[];

  /** Only meaningful when the user already had a Master Resume — see CvImportStrategy. Defaults to 'merge' when omitted, matching pre-Phase-12 behavior. */
  @IsOptional()
  @IsIn(['merge', 'replace'])
  strategy?: CvImportStrategy;
}
