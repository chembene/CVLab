import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { CoverLetterTemplateCategory } from '@prisma/client';

function toBoolean({ value }: { value: unknown }): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export class ListCoverLetterTemplatesQueryDto {
  @IsOptional()
  @IsEnum(CoverLetterTemplateCategory)
  category?: CoverLetterTemplateCategory;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  atsFriendly?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  premium?: boolean;
}
