import { ApplicationStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateApplicationDto {
  @IsString()
  @IsNotEmpty()
  jobTargetId!: string;

  // No FK yet — Resume Variants don't exist. See prisma/schema.prisma's
  // Application model comment.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  resumeId?: string;

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
