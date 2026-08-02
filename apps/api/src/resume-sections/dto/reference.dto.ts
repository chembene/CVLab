import { PartialType } from '@nestjs/mapped-types';
import { IsEmail, IsInt, IsOptional, IsString, Matches, Min, MaxLength } from 'class-validator';

export class CreateReferenceDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  company?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email is required.' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Phone must be a valid number.' })
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateReferenceDto extends PartialType(CreateReferenceDto) {}
