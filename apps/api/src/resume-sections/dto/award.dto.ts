import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class CreateAwardDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  issuer?: string;

  @IsOptional()
  @IsDateString()
  dateAwarded?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateAwardDto extends PartialType(CreateAwardDto) {}
