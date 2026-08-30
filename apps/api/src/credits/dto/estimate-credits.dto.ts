import { IsNotEmpty, IsString } from 'class-validator';

export class EstimateCreditsDto {
  @IsString()
  @IsNotEmpty()
  featureKey!: string;
}
