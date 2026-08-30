import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RunOptimizationDto {
  @IsString()
  @IsNotEmpty()
  resumeVariantId!: string;

  /** When true, always run a fresh ATS report as the "before" baseline instead of reusing the most recent existing one for this variant. */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
