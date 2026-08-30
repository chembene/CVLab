import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateAdviceDto {
  /** Either one of the frontend's suggested questions verbatim, or a free-text custom question — no distinction made server-side. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  question!: string;
}
