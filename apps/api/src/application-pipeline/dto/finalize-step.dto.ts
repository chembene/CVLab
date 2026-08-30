import { ApplicationStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

/** Mirrors the subset of CreateApplicationDto meaningful at pipeline-finalize time — jobTargetId/resumeVariantId come from the session, never the client. Defaults to ApplicationStatus.SAVED when omitted, same as Application's own schema default. */
export class FinalizeStepDto {
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
