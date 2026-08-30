import { InterviewDifficulty, InterviewMode, InterviewType } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * FASE 11 — three modes, one DTO. Only shape-level validation lives here
 * (type, presence-when-optional, length/range limits) — exactly the split
 * this codebase has always used: cross-field/mode-specific business rules
 * (e.g. "resumeVariantId is required for mode RESUME", "JOB needs
 * jobTargetId or jobDescription") are enforced in InterviewService.start(),
 * the same place today's pre-FASE-11 "variant must have a linked job
 * target" rule already lived. No `@ValidateIf`/custom cross-field validator
 * is introduced — this codebase has no precedent for one, and the
 * service-level `BadRequestException` pattern already gives clear,
 * PT-language error messages per mode.
 */
export class StartInterviewDto {
  @IsEnum(InterviewMode)
  mode!: InterviewMode;

  /** Mode RESUME: required. Mode JOB: optional (extra context). Mode ROLE: must be absent — rejected by the service, never silently ignored. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  resumeVariantId?: string;

  /** Mode JOB only: one of jobTargetId/jobDescription is required (both allowed together). Modes RESUME/ROLE: must be absent. RESUME derives its own Job Target from the Resume Variant, exactly as before FASE 11 — this field is never read for that mode. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  jobTargetId?: string;

  /** Mode JOB only: pasted vacancy text. Treated as untrusted user-provided data by the prompt builder, never as instructions — see InterviewQuestionPromptBuilder. Capped well below any realistic job posting length. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  jobDescription?: string;

  /** Mode ROLE only: required for that mode (enforced in the service, since it must be absent in RESUME/JOB). */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  role?: string;

  /** Mode ROLE only, optional. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  industry?: string;

  /** Mode ROLE only, optional. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience?: number;

  /** Mode ROLE only, optional. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  companyName?: string;

  @IsEnum(InterviewType)
  type!: InterviewType;

  @IsEnum(InterviewDifficulty)
  difficulty!: InterviewDifficulty;

  @IsString()
  @IsNotEmpty()
  language!: string;

  /** When present, verified to belong to the same user and read for its `summary` — see InterviewQuestionPromptBuilder. Only meaningful when the session has a resumeVariantId (mode RESUME, or mode JOB with one supplied) — the service rejects it otherwise. */
  @IsOptional()
  @IsString()
  optimizationId?: string;

  /** When present, verified to belong to the same user and read for its `content` — see InterviewQuestionPromptBuilder. Same resumeVariantId-only restriction as optimizationId. */
  @IsOptional()
  @IsString()
  coverLetterId?: string;
}
