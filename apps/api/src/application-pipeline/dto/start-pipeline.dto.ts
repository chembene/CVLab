import { IsNotEmpty, IsString } from 'class-validator';

/** Both required — the wizard never starts "empty". If the Variant isn't yet linked to this Job Target, ApplicationPipelineService links it (PUT /resume-variants/:id) before creating the session, exactly like a manual re-link would. */
export class StartPipelineDto {
  @IsString()
  @IsNotEmpty()
  resumeVariantId!: string;

  @IsString()
  @IsNotEmpty()
  jobTargetId!: string;
}
