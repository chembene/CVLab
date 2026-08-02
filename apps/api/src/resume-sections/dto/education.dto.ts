import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateEducationDto {
  @IsString()
  @MaxLength(200)
  institution!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  degree?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  field?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  location?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateEducationDto extends PartialType(CreateEducationDto) {}
