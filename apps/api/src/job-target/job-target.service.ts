import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JobTargetStatus } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { JobTargetRepository, type JobTargetWithChildren } from './job-target.repository';
import type { CreateJobTargetDto } from './dto/create-job-target.dto';
import type { UpdateJobTargetDto } from './dto/update-job-target.dto';

type JobTargetAction = 'created' | 'updated' | 'archived' | 'deleted';

/**
 * Owner-only (+ admin bypass) CRUD for Job Targets, including their three
 * child collections (keywords/skills/languages), which are replaced
 * wholesale on any write that includes them — see JobTargetRepository.
 */
@Injectable()
export class JobTargetService {
  constructor(
    private readonly jobTargetRepository: JobTargetRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async list(requestingUser: RequestUser, targetUserId: string): Promise<JobTargetWithChildren[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.jobTargetRepository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<JobTargetWithChildren> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  async create(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateJobTargetDto,
  ): Promise<JobTargetWithChildren> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const { keywords, skills, languages, ...data } = dto;

    const jobTarget = await this.jobTargetRepository.create(targetUserId, data);
    await Promise.all([
      keywords
        ? this.jobTargetRepository.replaceKeywords(jobTarget.id, keywords)
        : Promise.resolve(),
      skills ? this.jobTargetRepository.replaceSkills(jobTarget.id, skills) : Promise.resolve(),
      languages
        ? this.jobTargetRepository.replaceLanguages(jobTarget.id, languages)
        : Promise.resolve(),
    ]);

    this.emit(targetUserId, jobTarget.id, 'created');
    return this.findOwnedOrThrow(targetUserId, jobTarget.id);
  }

  async update(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: UpdateJobTargetDto,
  ): Promise<JobTargetWithChildren> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    const { keywords, skills, languages, ...data } = dto;

    await this.jobTargetRepository.update(id, data);
    await Promise.all([
      keywords ? this.jobTargetRepository.replaceKeywords(id, keywords) : Promise.resolve(),
      skills ? this.jobTargetRepository.replaceSkills(id, skills) : Promise.resolve(),
      languages ? this.jobTargetRepository.replaceLanguages(id, languages) : Promise.resolve(),
    ]);

    // "Job Target Archived" is its own history event, distinct from the
    // generic "updated" — fires only on the DRAFT/READY -> ARCHIVED
    // transition, not on every subsequent edit to an already-archived target.
    const becameArchived =
      data.status === JobTargetStatus.ARCHIVED && existing.status !== JobTargetStatus.ARCHIVED;
    this.emit(targetUserId, id, becameArchived ? 'archived' : 'updated');

    return this.findOwnedOrThrow(targetUserId, id);
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.jobTargetRepository.softDelete(id);
    this.emit(targetUserId, id, 'deleted');
  }

  /** Used by ApplicationService to verify a job target belongs to the applying user before an Application can reference it. */
  async assertOwnedJobTarget(
    requestingUser: RequestUser,
    targetUserId: string,
    jobTargetId: string,
  ): Promise<JobTargetWithChildren> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, jobTargetId);
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<JobTargetWithChildren> {
    const jobTarget = await this.jobTargetRepository.findById(id);
    if (!jobTarget || jobTarget.userId !== targetUserId) {
      throw new NotFoundException('Job target not found.');
    }
    return jobTarget;
  }

  private emit(userId: string, jobTargetId: string, action: JobTargetAction): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, 'job_target', jobTargetId, action),
    );
  }
}
