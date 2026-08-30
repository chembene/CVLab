/** True for a Prisma unique-constraint violation (P2002) — used to catch the race where two concurrent requests with the same idempotency key both pass the pre-check and only one insert can win. */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
