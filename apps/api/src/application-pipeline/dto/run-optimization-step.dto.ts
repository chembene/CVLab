import { IsBoolean, IsOptional } from 'class-validator';

/** Mirrors RunOptimizationDto — resumeVariantId comes from the session, never the client, so only `force` is left to accept here. */
export class RunOptimizationStepDto {
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
