import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Part 6 "Theme Customization" — every field the brief lists, all optional
 * (an absent field means "use the template's own default"). Shared, byte-
 * for-byte identical shape for both ResumeVariant.themeOverrides and
 * CoverLetter.themeOverrides — one DTO, reused by both PUT .../theme
 * endpoints, rather than two near-duplicate classes.
 */
export class ThemeOverridesDto {
  @IsOptional()
  @IsString()
  @MaxLength(9) // #RRGGBB or #RRGGBBAA
  primaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(9)
  secondaryColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(9)
  accentColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fontFamily?: string;

  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(24)
  fontSize?: number;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(250)
  lineHeightPercent?: number;

  @IsOptional()
  @IsIn(['compact', 'comfortable', 'spacious'])
  sectionSpacing?: 'compact' | 'comfortable' | 'spacious';

  @IsOptional()
  @IsIn(['narrow', 'normal', 'wide'])
  pageMargins?: 'narrow' | 'normal' | 'wide';

  @IsOptional()
  @IsIn(['band', 'minimal', 'centered', 'sidebar'])
  headerStyle?: 'band' | 'minimal' | 'centered' | 'sidebar';

  @IsOptional()
  @IsIn(['line', 'dotted', 'none'])
  dividerStyle?: 'line' | 'dotted' | 'none';

  @IsOptional()
  @IsBoolean()
  iconsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  photoEnabled?: boolean;
}
