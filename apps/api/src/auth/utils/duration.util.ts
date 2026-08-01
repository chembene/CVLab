const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const satisfies Record<string, number>;

type DurationUnit = keyof typeof UNIT_MS;

/**
 * Parses the limited duration formats used by JWT_ACCESS_TTL / JWT_REFRESH_TTL
 * (e.g. "15m", "30d") into milliseconds. Intentionally minimal — avoids
 * pulling in a duration-parsing dependency for two supported formats.
 */
export function parseDurationToMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration format: "${value}". Expected e.g. "15m" or "30d".`);
  }
  const amount = match[1] as string;
  const unit = match[2] as DurationUnit;
  return Number(amount) * UNIT_MS[unit];
}
