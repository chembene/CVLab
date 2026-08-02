import { IsOptional, IsString, MaxLength } from 'class-validator';

export class JobTargetLanguageInputDto {
  @IsString()
  @MaxLength(100)
  language!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  level?: string;
}
