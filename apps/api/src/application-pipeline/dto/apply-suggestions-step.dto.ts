import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

/** Mirrors ApplySuggestionsDto exactly — the optimizationId itself comes from the session, never the client. */
export class ApplySuggestionsStepDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  suggestionIds!: string[];
}
