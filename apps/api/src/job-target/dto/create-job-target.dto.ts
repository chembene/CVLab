import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { JobTargetStatus } from '@prisma/client';
import { JobTargetKeywordInputDto } from './job-target-keyword.dto';
import { JobTargetSkillInputDto } from './job-target-skill.dto';
import { JobTargetLanguageInputDto } from './job-target-language.dto';

/**
 * keywords/skills/languages are optional arrays: when present on a PUT they
 * fully replace the job target's existing set for that child collection
 * (see JobTargetService); when omitted, that collection is left untouched.
 * No sub-resource endpoints exist for them — the brief's API section lists
 * only CRUD for /job-targets itself.
 */
export class CreateJobTargetDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  employmentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  seniority?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaryMax?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  // Stored exactly as entered — never fetched, scraped, or parsed. See
  // JobTargetAnalysisService for why URL parsing stays unimplemented here.
  @IsOptional()
  @IsUrl({}, { message: 'Job URL must be a valid URL.' })
  jobUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  jobDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsEnum(JobTargetStatus)
  status?: JobTargetStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => JobTargetKeywordInputDto)
  keywords?: JobTargetKeywordInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => JobTargetSkillInputDto)
  skills?: JobTargetSkillInputDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => JobTargetLanguageInputDto)
  languages?: JobTargetLanguageInputDto[];
}
