import type { PrismaService } from '../../src/prisma/prisma.service';

/**
 * `EventEmitter2.emit()` dispatches synchronously but does not await async
 * listeners — `HistoryListener`'s DB write can still be in flight when an
 * HTTP response (and the test's very next `await`) returns. Polling here
 * instead of a single `findMany()` avoids an intermittent race between the
 * test assertion and the listener's write, without slowing down production
 * request latency by making the emit path itself synchronous.
 */
export async function waitForHistoryEventTypes(
  prisma: PrismaService,
  userId: string,
  expectedTypes: string[],
  { timeoutMs = 2000, intervalMs = 50 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<string[]> {
  const deadline = Date.now() + timeoutMs;
  let eventTypes: string[] = [];

  while (Date.now() < deadline) {
    const events = await prisma.historyEvent.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    eventTypes = events.map((e) => e.eventType);
    if (expectedTypes.every((type) => eventTypes.includes(type))) {
      return eventTypes;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return eventTypes;
}
