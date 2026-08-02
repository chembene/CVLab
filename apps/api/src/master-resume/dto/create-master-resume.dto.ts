import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * `completionPercentage` is deliberately absent — it's server-computed only
 * (ResumeCompletionService), never accepted from the client, per
 * prompts task's "Completion percentage is automatically calculated."
 *
 * `visibility`/`status` are validated as plain strings, not a closed set —
 * see prisma/schema.prisma's MasterResume comment: their value sets aren't
 * specified by the brief, so the DTO stays as open as the schema column.
 */
export class CreateMasterResumeDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  careerLevel?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience?: number;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  desiredPosition?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  desiredSalary?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  visibility?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
