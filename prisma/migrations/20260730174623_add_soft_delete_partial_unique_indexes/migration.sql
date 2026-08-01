-- Soft-delete-aware uniqueness for users.email / users.phone.
--
-- Prisma's schema language cannot express partial (WHERE-clause) unique
-- indexes, so this is hand-authored SQL rather than generated from
-- schema.prisma. Rationale: docs/architecture/database-overview.md §3 —
-- users is soft-deleted (deleted_at), and a plain unique constraint on
-- email/phone would incorrectly block reusing an email after a
-- soft-deleted account. Only currently-active (deleted_at IS NULL) rows
-- must be unique.

CREATE UNIQUE INDEX "users_email_active_unique_idx" ON "users" ("email") WHERE "deleted_at" IS NULL;

CREATE UNIQUE INDEX "users_phone_active_unique_idx" ON "users" ("phone") WHERE "deleted_at" IS NULL AND "phone" IS NOT NULL;
