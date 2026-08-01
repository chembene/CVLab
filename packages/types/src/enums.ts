/**
 * Enums mirrored from prisma/schema.prisma.
 * These are the closed value sets explicitly defined in the architecture docs
 * (docs/architecture/database-overview.md, credit-architecture.md, payment-architecture.md,
 * ai-architecture.md, cv-data-model.md). Kept here so frontend and backend never drift.
 */

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  DELETED = 'DELETED',
}

export enum CvStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
}

export enum CreditTransactionType {
  PURCHASE = 'PURCHASE',
  BONUS = 'BONUS',
  CONSUMPTION = 'CONSUMPTION',
  REFUND = 'REFUND',
  ADMIN_ADJUSTMENT = 'ADMIN_ADJUSTMENT',
  EXPIRATION = 'EXPIRATION',
  PROMOTION = 'PROMOTION',
  REVERSAL = 'REVERSAL',
}

export enum PaymentProvider {
  MPESA = 'MPESA',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  REVERSED = 'REVERSED',
  REFUNDED = 'REFUNDED',
}

export enum AiRequestStatus {
  PENDING = 'PENDING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  TIMEOUT = 'TIMEOUT',
}
