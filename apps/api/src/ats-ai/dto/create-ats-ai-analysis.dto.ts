import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAtsAiAnalysisDto {
  /** References an existing, already-computed AtsReport — never a full CV/job-description payload; the backend already has all of that. */
  @IsString()
  @IsNotEmpty()
  atsReportId!: string;
}
