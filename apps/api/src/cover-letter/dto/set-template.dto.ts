import { IsString, MinLength } from 'class-validator';

export class SetTemplateDto {
  @IsString()
  @MinLength(1)
  templateId!: string;
}
