import { Injectable } from '@nestjs/common';
import type { ExportedDocument, ExportFormat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface UpsertPendingExportData {
  userId: string;
  resumeVariantId: string;
  resumeVariantVersionId?: string;
  format: ExportFormat;
  idempotencyKey: string;
}

/**
 * Only Prisma access for `exported_documents` lives here. `upsertPending()`
 * is keyed on the deterministic `idempotencyKey` (never `randomUUID()` —
 * see docs/architecture/export-engine.md §"Idempotency"): a first call
 * creates a fresh `PENDING` row, a repeat with the exact same
 * user/variant/version/format resets the *same* row back to `PENDING`
 * rather than colliding with the column's unique constraint — the
 * double-charge guard itself lives one layer up, in CreditService's own
 * idempotent `spend()`, not here.
 */
@Injectable()
export class ExportRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertPending(data: UpsertPendingExportData): Promise<ExportedDocument> {
    return this.prisma.exportedDocument.upsert({
      where: { idempotencyKey: data.idempotencyKey },
      create: { ...data, status: 'PENDING' },
      update: { status: 'PENDING', failureReason: null, completedAt: null },
    });
  }

  markSuccess(id: string, creditsCharged: number): Promise<ExportedDocument> {
    return this.prisma.exportedDocument.update({
      where: { id },
      data: { status: 'SUCCESS', creditsCharged, completedAt: new Date() },
    });
  }

  markFailed(
    id: string,
    creditsCharged: number,
    creditsRefunded: number,
    failureReason: string,
  ): Promise<ExportedDocument> {
    return this.prisma.exportedDocument.update({
      where: { id },
      data: {
        status: 'FAILED',
        creditsCharged,
        creditsRefunded,
        failureReason,
        completedAt: new Date(),
      },
    });
  }
}
