import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateLanguageDto {
  @IsString()
  @MaxLength(100)
  language!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  proficiency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateLanguageDto extends PartialType(CreateLanguageDto) {}
