import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class JobTargetSkillInputDto {
  @IsString()
  @MaxLength(100)
  skill!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;
}
