import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { MasterResume, Prisma, ResumeVariant } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { MasterResumeRepository } from '../master-resume/master-resume.repository';
import { ResumeSectionsRepository } from '../resume-sections/resume-sections.repository';
import { SECTION_DEFINITIONS, type SectionType } from '../resume-sections/section-registry';
import { JobTargetService } from '../job-target/job-target.service';
import { ResumeVariantRepository } from './resume-variant.repository';
import { calculateVariantCompletion } from './resume-variant-completion.util';
import { SECTION_TYPE_TO_CONTENT_KEY, toSnapshotSection } from './resume-variant-snapshot.util';
import type { CreateResumeVariantDto } from './dto/create-resume-variant.dto';
import type { UpdateResumeVariantDto } from './dto/update-resume-variant.dto';
import type { DuplicateResumeVariantDto } from './dto/duplicate-resume-variant.dto';

type VariantAction = 'created' | 'updated' | 'archived' | 'restored' | 'deleted';

/**
 * Owner-only (+ admin bypass) CRUD for Resume Variants, plus the
 * duplicate/archive/restore state transitions. A Variant is an independent
 * snapshot of the Master Resume taken at creation/duplication time — see
 * docs/architecture/master-resume-data-model.md §9. Nothing here ever
 * writes back to MasterResume or its sections.
 */
@Injectable()
export class ResumeVariantService {
  constructor(
    private readonly variantRepository: ResumeVariantRepository,
    private readonly masterResumeRepository: MasterResumeRepository,
    private readonly sectionsRepository: ResumeSectionsRepository,
    private readonly jobTargetService: JobTargetService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async list(requestingUser: RequestUser, targetUserId: string): Promise<ResumeVariant[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.variantRepository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  async create(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateResumeVariantDto,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const masterResume = await this.masterResumeRepository.findByUserId(targetUserId);
    if (!masterResume) {
      throw new NotFoundException('Create a master resume before creating variants.');
    }
    if (dto.jobTargetId) {
      await this.jobTargetService.assertOwnedJobTarget(
        requestingUser,
        targetUserId,
        dto.jobTargetId,
      );
    }

    const content = await this.buildSnapshot(masterResume);
    const completionPercentage = calculateVariantCompletion(dto.title, content);

    const variant = await this.variantRepository.create(targetUserId, masterResume.id, {
      title: dto.title,
      jobTargetId: dto.jobTargetId,
      status: dto.status,
      content: content as Prisma.InputJsonValue,
      completionPercentage,
    });

    this.emit(targetUserId, variant.id, 'created');
    return variant;
  }

  async update(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: UpdateResumeVariantDto,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);

    if (dto.jobTargetId) {
      await this.jobTargetService.assertOwnedJobTarget(
        requestingUser,
        targetUserId,
        dto.jobTargetId,
      );
    }

    let completionPercentage = existing.completionPercentage;
    if (dto.content || dto.title) {
      const nextTitle = dto.title ?? existing.title;
      const nextContent = dto.content ?? (existing.content as Record<string, unknown>);
      completionPercentage = calculateVariantCompletion(nextTitle, nextContent);
    }

    const updated = await this.variantRepository.applyEdit(id, {
      title: dto.title,
      status: dto.status,
      jobTargetId: dto.jobTargetId,
      content: dto.content as Prisma.InputJsonValue | undefined,
      completionPercentage,
    });

    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  async duplicate(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: DuplicateResumeVariantDto,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const source = await this.findOwnedOrThrow(targetUserId, id);

    const variant = await this.variantRepository.create(targetUserId, source.masterResumeId, {
      title: dto.title ?? `${source.title} (copy)`,
      jobTargetId: source.jobTargetId ?? undefined,
      status: 'DRAFT',
      content: source.content as Prisma.InputJsonValue,
      completionPercentage: source.completionPercentage,
    });

    // A duplicate is a brand new, independent row — "created", not "updated".
    this.emit(targetUserId, variant.id, 'created');
    return variant;
  }

  async archive(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    if (existing.archived) {
      return existing; // idempotent no-op — no duplicate history event
    }

    const updated = await this.variantRepository.update(id, { archived: true });
    this.emit(targetUserId, id, 'archived');
    return updated;
  }

  async restore(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    if (!existing.archived) {
      return existing; // idempotent no-op
    }

    const updated = await this.variantRepository.update(id, { archived: false });
    this.emit(targetUserId, id, 'restored');
    return updated;
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.variantRepository.softDelete(id);
    this.emit(targetUserId, id, 'deleted');
  }

  /** Used by ApplicationService to verify a resume variant belongs to the applying user before an Application can reference it. */
  async assertOwnedVariant(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, variantId);
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<ResumeVariant> {
    const variant = await this.variantRepository.findById(id);
    if (!variant || variant.userId !== targetUserId) {
      throw new NotFoundException('Resume variant not found.');
    }
    return variant;
  }

  /** Copies the Master Resume's own fields + all 11 live sections into a plain, self-contained content object — a one-time read, never a live link. */
  private async buildSnapshot(masterResume: MasterResume): Promise<Record<string, unknown>> {
    const content: Record<string, unknown> = {
      title: masterResume.title,
      summary: masterResume.summary,
      careerLevel: masterResume.careerLevel,
      yearsExperience: masterResume.yearsExperience,
      desiredPosition: masterResume.desiredPosition,
      desiredSalary: masterResume.desiredSalary != null ? Number(masterResume.desiredSalary) : null,
      currency: masterResume.currency,
    };

    for (const sectionType of Object.keys(SECTION_DEFINITIONS) as SectionType[]) {
      const records = await this.sectionsRepository.findAllByResumeId(sectionType, masterResume.id);
      content[SECTION_TYPE_TO_CONTENT_KEY[sectionType]] = records.map(toSnapshotSection);
    }

    return content;
  }

  private emit(userId: string, variantId: string, action: VariantAction): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, 'resume_variant', variantId, action),
    );
  }
}
