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

export enum JobTargetStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  ARCHIVED = 'ARCHIVED',
}

export enum OptimizationStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum SuggestionPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum SuggestionType {
  KEYWORD = 'KEYWORD',
  SUMMARY = 'SUMMARY',
  EXPERIENCE = 'EXPERIENCE',
  SKILL = 'SKILL',
  EDUCATION = 'EDUCATION',
  PROJECT = 'PROJECT',
  ACHIEVEMENT = 'ACHIEVEMENT',
  LANGUAGE = 'LANGUAGE',
  CERTIFICATION = 'CERTIFICATION',
  GENERAL = 'GENERAL',
}

export enum CoverLetterStatus {
  DRAFT = 'DRAFT',
  GENERATED = 'GENERATED',
  EDITED = 'EDITED',
  ARCHIVED = 'ARCHIVED',
}

export enum CoverLetterTone {
  PROFESSIONAL = 'PROFESSIONAL',
  MODERN = 'MODERN',
  EXECUTIVE = 'EXECUTIVE',
  TECHNICAL = 'TECHNICAL',
  FRIENDLY = 'FRIENDLY',
}

export enum InterviewType {
  GENERAL = 'GENERAL',
  TECHNICAL = 'TECHNICAL',
  BEHAVIORAL = 'BEHAVIORAL',
  MIXED = 'MIXED',
}

/** FASE 11 — which of the 3 modes an InterviewSession was started in. RESUME: CV + Job Target, both required. JOB: Job Target and/or pasted job description, CV optional. ROLE: no CV, no Job Target — just a role/title. */
export enum InterviewMode {
  RESUME = 'RESUME',
  JOB = 'JOB',
  ROLE = 'ROLE',
}

export enum InterviewDifficulty {
  JUNIOR = 'JUNIOR',
  MID = 'MID',
  SENIOR = 'SENIOR',
  EXECUTIVE = 'EXECUTIVE',
}

export enum InterviewStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum QuestionCategory {
  BEHAVIORAL = 'BEHAVIORAL',
  TECHNICAL = 'TECHNICAL',
  SITUATIONAL = 'SITUATIONAL',
  CULTURE = 'CULTURE',
  LEADERSHIP = 'LEADERSHIP',
  COMMUNICATION = 'COMMUNICATION',
}

export enum ApplicationStatus {
  SAVED = 'SAVED',
  APPLIED = 'APPLIED',
  INTERVIEW = 'INTERVIEW',
  OFFER = 'OFFER',
  REJECTED = 'REJECTED',
  WITHDRAWN = 'WITHDRAWN',
  ARCHIVED = 'ARCHIVED',
}

/** Smart Application Pipeline — the guided "Prepare Application" wizard session's own lifecycle, distinct from ApplicationStatus above (which tracks the final, submitted Application after the wizard finishes). */
export enum ApplicationPipelineStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  ABANDONED = 'ABANDONED',
}

export enum ApplicationPipelineStep {
  JOB_IMPORT = 'JOB_IMPORT',
  ATS_ANALYSIS = 'ATS_ANALYSIS',
  OPTIMIZATION = 'OPTIMIZATION',
  SUGGESTION_REVIEW = 'SUGGESTION_REVIEW',
  APPLY_SUGGESTIONS = 'APPLY_SUGGESTIONS',
  COVER_LETTER = 'COVER_LETTER',
  INTERVIEW_PREP = 'INTERVIEW_PREP',
  EXPORT = 'EXPORT',
  FINALIZE = 'FINALIZE',
  SUMMARY = 'SUMMARY',
}
