import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ApplySuggestionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  suggestionIds!: string[];
}
