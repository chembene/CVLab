import { CoverLetterTone } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Manual editing (PUT /cover-letter/:id) — present fields are updated in place; absent fields are left untouched. Never bumps `version` — see docs/architecture/cover-letter-engine.md "Versioning". */
export class UpdateCoverLetterDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;

  @IsOptional()
  @IsEnum(CoverLetterTone)
  tone?: CoverLetterTone;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  language?: string;
}
