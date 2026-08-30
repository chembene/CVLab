import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ResumeVersionLabel } from '@prisma/client';

/** "Save Version" (rule 2, manual checkpoint) — snapshots the Variant's current content unchanged, under a user-chosen label/note. */
export class SaveCheckpointDto {
  @IsOptional()
  @IsEnum(ResumeVersionLabel)
  label?: ResumeVersionLabel;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
