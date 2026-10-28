import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitTestAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId!: string;

  /** Null/omitted means "skip this question for now" — never rejected, since a partial attempt must still be submittable. */
  @IsOptional()
  @IsString()
  selectedAnswer?: string | null;
}
