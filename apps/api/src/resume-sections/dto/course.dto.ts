import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateCourseDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  provider?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  hours?: number;

  @IsOptional()
  @IsDateString()
  completionDate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateCourseDto extends PartialType(CreateCourseDto) {}
