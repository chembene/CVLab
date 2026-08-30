import { ExportFormat } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateExportDto {
  @IsString()
  @IsNotEmpty()
  resumeVariantId!: string;

  /** When present, verified to belong to `resumeVariantId` and to the caller before use — never silently falls back to the current version. Omitted → export the Variant's current content. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  resumeVariantVersionId?: string;

  @IsEnum(ExportFormat)
  format!: ExportFormat;
}
