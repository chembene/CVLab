import { PaymentProviderName } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';

/** Amount/currency/credits are never accepted from the client — always derived server-side from the CreditPackage this packageId resolves to (prompts/12-mpesa-integration.md §7). */
export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  packageId!: string;

  @IsEnum(PaymentProviderName)
  provider!: PaymentProviderName;
}
