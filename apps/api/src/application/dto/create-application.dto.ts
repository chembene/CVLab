import { ApplicationStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @IsNotEmpty()
  jobTargetId!: string;

  // Optional — an application can exist before a tailored variant has been
  // created for it. When present, must be a Resume Variant the same user
  // owns (verified by ApplicationService via ResumeVariantService).
  @IsOptional()
  @IsString()
  resumeVariantId?: string;

  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @IsOptional()
  @IsDateString()
  appliedAt?: string;

  @IsOptional()
  @IsDateString()
  interviewDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
