import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, IsString, Max, Min, MaxLength } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  level?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsExperience?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateSkillDto extends PartialType(CreateSkillDto) {}
