import { InterviewDifficulty, InterviewType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

/**
 * Mirrors StartInterviewDto's shape-only fields — `mode` is always JOB in
 * the Pipeline context (never accepted from the client), and
 * resumeVariantId/jobTargetId/optimizationId/coverLetterId all come from
 * the session itself, not the request body.
 */
export class StartInterviewStepDto {
  @IsEnum(InterviewType)
  type!: InterviewType;

  @IsEnum(InterviewDifficulty)
  difficulty!: InterviewDifficulty;

  @IsString()
  @IsNotEmpty()
  language!: string;
}
