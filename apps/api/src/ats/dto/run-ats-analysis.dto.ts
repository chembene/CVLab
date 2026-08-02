import { IsNotEmpty, IsString } from 'class-validator';

/**
 * The Job Target being compared against is always the Resume Variant's own
 * linked `jobTargetId` — never accepted separately from the client, so a
 * report can't be run against a mismatched pairing. See AtsAnalysisService.
 */
export class RunAtsAnalysisDto {
  @IsString()
  @IsNotEmpty()
  resumeVariantId!: string;
}
