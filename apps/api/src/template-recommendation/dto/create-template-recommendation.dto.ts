import { IsOptional, IsString } from 'class-validator';

export class CreateTemplateRecommendationDto {
  /** Optional — when given, its content (and, unless jobTargetId is also given, its own linked Job Target) refines the recommendation. Never required: the recommendation still works from Master Resume context alone. */
  @IsOptional()
  @IsString()
  resumeVariantId?: string;

  /** Optional — when given directly, takes precedence over any Job Target inferred from resumeVariantId. */
  @IsOptional()
  @IsString()
  jobTargetId?: string;
}
