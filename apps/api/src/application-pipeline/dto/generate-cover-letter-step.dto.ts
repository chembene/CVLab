import { CoverLetterTone } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

/** Mirrors GenerateCoverLetterDto — resumeVariantId comes from the session; optimizationId (when the session already has one) is filled in by the service itself, never accepted from the client here. */
export class GenerateCoverLetterStepDto {
  @IsEnum(CoverLetterTone)
  tone!: CoverLetterTone;

  @IsString()
  @IsNotEmpty()
  language!: string;
}
