import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { MasterResume } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import { ResumeCompletionService } from '../resume-completion/resume-completion.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { MasterResumeRepository, type MasterResumeData } from './master-resume.repository';

/** Exactly one Master Resume per user (also enforced at the DB level via a unique userId column). */
@Injectable()
export class MasterResumeService {
  constructor(
    private readonly masterResumeRepository: MasterResumeRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly completionService: ResumeCompletionService,
  ) {}

  async getForUser(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<MasterResume | null> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.masterResumeRepository.findByUserId(targetUserId);
  }

  async createForUser(
    requestingUser: RequestUser,
    targetUserId: string,
    data: MasterResumeData,
  ): Promise<MasterResume> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const existing = await this.masterResumeRepository.findByUserId(targetUserId);
    if (existing) {
      throw new ConflictException('A master resume already exists for this user.');
    }

    const resume = await this.masterResumeRepository.create(targetUserId, {
      status: 'DRAFT',
      currency: 'MZN',
      visibility: 'PRIVATE',
      ...data,
    });

    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(targetUserId, 'master_resume', resume.id, 'created'),
    );
    await this.completionService.recalculate(targetUserId);

    return resume;
  }

  async updateForUser(
    requestingUser: RequestUser,
    targetUserId: string,
    data: MasterResumeData,
  ): Promise<MasterResume> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const existing = await this.masterResumeRepository.findByUserId(targetUserId);
    if (!existing) {
      throw new NotFoundException('No master resume exists for this user yet. Create one first.');
    }

    const resume = await this.masterResumeRepository.update(existing.id, data);

    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(targetUserId, 'master_resume', resume.id, 'updated'),
    );
    await this.completionService.recalculate(targetUserId);

    return resume;
  }
}
