import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ResumeTemplateCategory } from '@prisma/client';

function toBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/** Gallery filters (Part 7) — every field optional; an empty query returns the full catalog. */
export class ListResumeTemplatesQueryDto {
  @IsOptional()
  @IsEnum(ResumeTemplateCategory)
  category?: ResumeTemplateCategory;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  atsFriendly?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  premium?: boolean;
}
