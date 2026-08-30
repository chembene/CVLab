import { IsIn, IsInt, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

/** `type` is restricted to the two admin-initiated grant/correction types — PURCHASE/BONUS only ever come from a verified payment, CONSUMPTION/REFUND/REVERSAL only from their own dedicated flows. `amount` may be positive (grant) or negative (deduction); zero is rejected by the service. */
export class AdminAdjustCreditsDto {
  @IsUUID()
  userId!: string;

  @IsInt()
  amount!: number;

  @IsIn(['ADMIN_ADJUSTMENT', 'PROMOTION'])
  type!: 'ADMIN_ADJUSTMENT' | 'PROMOTION';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey!: string;
}
