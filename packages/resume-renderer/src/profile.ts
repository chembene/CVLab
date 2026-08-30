/**
 * The minimal profile shape `HeaderRenderer` reads — deliberately
 * re-declared here rather than importing apps/web's `lib/api/profile.ts`
 * `Profile` type (which also carries `id`/`userId`/`address`/`birthDate`/
 * `bio`/`createdAt`/`updatedAt`, irrelevant to rendering). Structurally
 * compatible: both apps/web's API type and apps/api's Prisma `Profile` row
 * satisfy this shape as-is (same field names, same casing).
 */
export interface RendererProfile {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  headline?: string | null;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  city?: string | null;
  linkedin?: string | null;
  github?: string | null;
  portfolio?: string | null;
  website?: string | null;
  photoUrl?: string | null;
}
