import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SECTION_DEFINITIONS, type SectionType } from './section-registry';

export interface SectionRecord {
  id: string;
  resumeId: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  [key: string]: unknown;
}

/**
 * One generic repository for all 11 section models, dispatching to the
 * right Prisma delegate via SECTION_DEFINITIONS. Every section table has an
 * identical CRUD shape (see section-registry.ts's doc comment), which is
 * what makes a single generic implementation correct rather than a
 * leaky/premature abstraction.
 */
@Injectable()
export class ResumeSectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private delegate(sectionType: SectionType) {
    const { delegate } = SECTION_DEFINITIONS[sectionType];
    // Justified use of a dynamic property lookup: Prisma's generated client
    // has one strongly-typed delegate per model, but no supertype spanning
    // "any delegate with these CRUD methods" — this is the single point
    // where that generic dispatch happens.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.prisma as unknown as Record<string, any>)[delegate];
  }

  findAllByResumeId(sectionType: SectionType, resumeId: string): Promise<SectionRecord[]> {
    return this.delegate(sectionType).findMany({
      where: { resumeId, deletedAt: null },
      orderBy: { displayOrder: 'asc' },
    });
  }

  findById(sectionType: SectionType, id: string): Promise<SectionRecord | null> {
    return this.delegate(sectionType).findFirst({ where: { id, deletedAt: null } });
  }

  findActiveMatchingFields(
    sectionType: SectionType,
    resumeId: string,
    fieldValues: Record<string, string>,
  ): Promise<SectionRecord | null> {
    const where: Record<string, unknown> = { resumeId, deletedAt: null };
    for (const [field, value] of Object.entries(fieldValues)) {
      where[field] = { equals: value, mode: 'insensitive' };
    }
    return this.delegate(sectionType).findFirst({ where });
  }

  countActive(sectionType: SectionType, resumeId: string): Promise<number> {
    return this.delegate(sectionType).count({ where: { resumeId, deletedAt: null } });
  }

  create(
    sectionType: SectionType,
    resumeId: string,
    data: Record<string, unknown>,
  ): Promise<SectionRecord> {
    return this.delegate(sectionType).create({
      data: { resumeId, ...this.normalizeDates(sectionType, data) },
    });
  }

  update(
    sectionType: SectionType,
    id: string,
    data: Record<string, unknown>,
  ): Promise<SectionRecord> {
    return this.delegate(sectionType).update({
      where: { id },
      data: this.normalizeDates(sectionType, data),
    });
  }

  /**
   * DTOs validate date fields as ISO strings (@IsDateString), but Prisma's
   * client rejects a bare "YYYY-MM-DD" string for a @db.Date column —
   * converts each configured date field to a real Date, leaving everything
   * else untouched. See SectionDefinition.dateFields.
   */
  private normalizeDates(
    sectionType: SectionType,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const { dateFields } = SECTION_DEFINITIONS[sectionType];
    if (!dateFields) {
      return data;
    }

    const normalized = { ...data };
    for (const field of dateFields) {
      const value = normalized[field];
      if (typeof value === 'string') {
        normalized[field] = new Date(value);
      }
    }
    return normalized;
  }

  softDelete(sectionType: SectionType, id: string): Promise<SectionRecord> {
    return this.delegate(sectionType).update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
