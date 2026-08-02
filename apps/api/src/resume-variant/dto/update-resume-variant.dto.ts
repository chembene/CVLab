import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `content`, when present, wholesale-replaces the Variant's current
 * snapshot (same "replace on write" pattern as Job Target's keyword/skill/
 * language collections) — there is no per-field/per-section endpoint for
 * Variants in this phase. `jobTargetId` may only be set to a new value
 * (re-link); unlinking an already-linked Job Target isn't supported yet —
 * see docs/architecture/master-resume-data-model.md §9 "Known limitations".
 */
export class UpdateResumeVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;

  @IsOptional()
  @IsString()
  jobTargetId?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}
