import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLinkedInProfileDto {
  /** Optional — the role the generated profile should be angled toward. Falls back to the most recent Job Target, or general optimization, when absent. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  targetRole?: string;
}
