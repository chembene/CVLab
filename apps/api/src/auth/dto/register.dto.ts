import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Password policy: minimum 10 characters (bcrypt silently truncates beyond
 * 72 bytes, hence the max), at least one lowercase, one uppercase and one
 * digit. No special-character requirement — a common source of user
 * friction without much additional strength once length/mix are enforced.
 */
export class RegisterDto {
  @IsEmail({}, { message: 'A valid email is required.' })
  email!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long.' })
  @MaxLength(72, { message: 'Password must be at most 72 characters long.' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one lowercase letter, one uppercase letter and one digit.',
  })
  password!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Phone must be a valid number.' })
  phone?: string;
}
