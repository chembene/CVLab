import { IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class JobTargetKeywordInputDto {
  @IsString()
  @MaxLength(100)
  keyword!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  weight?: number;
}
