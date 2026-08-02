import { PartialType } from '@nestjs/mapped-types';
import { IsDateString, IsInt, IsOptional, IsString, IsUrl, Min, MaxLength } from 'class-validator';

export class CreateCertificateDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  issuer?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expirationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  credentialId?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Credential URL must be a valid URL.' })
  credentialUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateCertificateDto extends PartialType(CreateCertificateDto) {}
