import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * `content` is deliberately absent — creation always snapshots the caller's
 * Master Resume server-side (ResumeVariantService.buildSnapshot); a client
 * can never seed a Variant's content directly.
 */
export class CreateResumeVariantDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  jobTargetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  status?: string;
}
