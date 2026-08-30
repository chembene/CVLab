import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** Defaults to 6 — one question per QuestionCategory value — when omitted. See InterviewService.generateQuestions(). */
export class GenerateQuestionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(12)
  questionCount?: number;
}
