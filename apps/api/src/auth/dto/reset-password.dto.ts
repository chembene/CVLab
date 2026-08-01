import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Token is required.' })
  token!: string;

  @IsString()
  @MinLength(10, { message: 'Password must be at least 10 characters long.' })
  @MaxLength(72, { message: 'Password must be at most 72 characters long.' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one lowercase letter, one uppercase letter and one digit.',
  })
  newPassword!: string;
}
