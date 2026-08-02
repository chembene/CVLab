import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import { ResumeCompletionService } from '../resume-completion/resume-completion.service';
import { MasterResumeRepository } from '../master-resume/master-resume.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeSectionsRepository, type SectionRecord } from './resume-sections.repository';
import { SECTION_DEFINITIONS, type SectionType } from './section-registry';

/**
 * One generic service implementing CRUD + reordering + duplicate detection
 * + soft-delete + history/completion side effects for all 11 resume
 * sections. Per-section-type controllers (thin) and DTOs (fully typed,
 * per-field-validated) sit on top of this — see resume-sections/controllers/.
 */
@Injectable()
export class ResumeSectionsService {
  constructor(
    private readonly sectionsRepository: ResumeSectionsRepository,
    private readonly masterResumeRepository: MasterResumeRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly completionService: ResumeCompletionService,
  ) {}

  async list(
    sectionType: SectionType,
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<SectionRecord[]> {
    const resumeId = await this.resolveResumeId(requestingUser, targetUserId);
    return this.sectionsRepository.findAllByResumeId(sectionType, resumeId);
  }

  async create(
    sectionType: SectionType,
    requestingUser: RequestUser,
    targetUserId: string,
    dto: object,
  ): Promise<SectionRecord> {
    const data = dto as Record<string, unknown>;
    const resumeId = await this.resolveResumeId(requestingUser, targetUserId);
    await this.assertNoDuplicate(sectionType, resumeId, data);

    const displayOrder =
      typeof data.displayOrder === 'number'
        ? data.displayOrder
        : await this.sectionsRepository.countActive(sectionType, resumeId);

    const row = await this.sectionsRepository.create(sectionType, resumeId, {
      ...data,
      displayOrder,
    });
    await this.afterMutation(sectionType, targetUserId, row.id, 'created');
    return row;
  }

  async update(
    sectionType: SectionType,
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: object,
  ): Promise<SectionRecord> {
    const data = dto as Record<string, unknown>;
    const resumeId = await this.resolveResumeId(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(sectionType, resumeId, id);
    await this.assertNoDuplicate(sectionType, resumeId, data, existing.id);

    const row = await this.sectionsRepository.update(sectionType, id, data);
    await this.afterMutation(sectionType, targetUserId, id, 'updated');
    return row;
  }

  async remove(
    sectionType: SectionType,
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<void> {
    const resumeId = await this.resolveResumeId(requestingUser, targetUserId);
    await this.findOwnedOrThrow(sectionType, resumeId, id);

    await this.sectionsRepository.softDelete(sectionType, id);
    await this.afterMutation(sectionType, targetUserId, id, 'deleted');
  }

  /** Reassigns displayOrder to match the given id order (0-indexed). Every id must belong to the caller's resume. */
  async reorder(
    sectionType: SectionType,
    requestingUser: RequestUser,
    targetUserId: string,
    orderedIds: string[],
  ): Promise<SectionRecord[]> {
    const resumeId = await this.resolveResumeId(requestingUser, targetUserId);
    const existingRows = await this.sectionsRepository.findAllByResumeId(sectionType, resumeId);
    const existingIds = new Set(existingRows.map((row) => row.id));

    for (const id of orderedIds) {
      if (!existingIds.has(id)) {
        throw new NotFoundException('One or more section items do not belong to this resume.');
      }
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        this.sectionsRepository.update(sectionType, id, { displayOrder: index }),
      ),
    );

    return this.sectionsRepository.findAllByResumeId(sectionType, resumeId);
  }

  private async resolveResumeId(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<string> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const resume = await this.masterResumeRepository.findByUserId(targetUserId);
    if (!resume) {
      throw new NotFoundException('Create a master resume before adding sections.');
    }
    return resume.id;
  }

  private async findOwnedOrThrow(
    sectionType: SectionType,
    resumeId: string,
    id: string,
  ): Promise<SectionRecord> {
    const existing = await this.sectionsRepository.findById(sectionType, id);
    if (!existing || existing.resumeId !== resumeId) {
      throw new NotFoundException('Section item not found.');
    }
    return existing;
  }

  private async assertNoDuplicate(
    sectionType: SectionType,
    resumeId: string,
    data: Record<string, unknown>,
    excludeId?: string,
  ): Promise<void> {
    const { duplicateCheckFields, entityType } = SECTION_DEFINITIONS[sectionType];
    if (!duplicateCheckFields) {
      return;
    }

    const fieldValues: Record<string, string> = {};
    for (const field of duplicateCheckFields) {
      const value = data[field];
      if (typeof value !== 'string' || value.trim() === '') {
        // Nothing to compare yet (e.g. a partial update not touching these
        // fields) — skip the check rather than false-positive on empty strings.
        return;
      }
      fieldValues[field] = value;
    }

    const match = await this.sectionsRepository.findActiveMatchingFields(
      sectionType,
      resumeId,
      fieldValues,
    );
    if (match && match.id !== excludeId) {
      throw new ConflictException(
        `This ${entityType.replace(/_/g, ' ')} already exists on this resume.`,
      );
    }
  }

  private async afterMutation(
    sectionType: SectionType,
    userId: string,
    entityId: string,
    action: 'created' | 'updated' | 'deleted',
  ): Promise<void> {
    const { entityType } = SECTION_DEFINITIONS[sectionType];
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, entityType, entityId, action),
    );
    await this.completionService.recalculate(userId);
  }
}
