import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class ImportJobDto {
  @IsString()
  @IsNotEmpty()
  @IsUrl({ require_protocol: true })
  url!: string;
}
