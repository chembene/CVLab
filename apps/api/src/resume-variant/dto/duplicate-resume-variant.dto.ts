import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DuplicateResumeVariantDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}
