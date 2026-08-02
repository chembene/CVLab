import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * All fields optional — PUT /api/v1/profile upserts (creates on first save,
 * otherwise replaces). Personal information only, per prompts task's
 * Profile field list; never role/status/professional data.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  headline?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Phone must be a valid number.' })
  phone?: string;

  @IsOptional()
  @IsEmail({}, { message: 'A valid email is required.' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsUrl({}, { message: 'LinkedIn must be a valid URL.' })
  linkedin?: string;

  @IsOptional()
  @IsUrl({}, { message: 'GitHub must be a valid URL.' })
  github?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Portfolio must be a valid URL.' })
  portfolio?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Website must be a valid URL.' })
  website?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Photo must be a valid URL.' })
  photoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;
}
