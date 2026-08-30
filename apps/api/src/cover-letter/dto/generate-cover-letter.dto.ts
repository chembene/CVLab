import { CoverLetterTone } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateCoverLetterDto {
  @IsString()
  @IsNotEmpty()
  resumeVariantId!: string;

  @IsEnum(CoverLetterTone)
  tone!: CoverLetterTone;

  @IsString()
  @IsNotEmpty()
  language!: string;

  /** When present, verified to belong to the same user and read for its `summary` — see CoverLetterPromptBuilder. Never required. */
  @IsOptional()
  @IsString()
  optimizationId?: string;
}
