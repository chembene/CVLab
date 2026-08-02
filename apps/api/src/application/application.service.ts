import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Application } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { JobTargetService } from '../job-target/job-target.service';
import { ApplicationRepository } from './application.repository';
import type { CreateApplicationDto } from './dto/create-application.dto';
import type { UpdateApplicationDto } from './dto/update-application.dto';

type ApplicationAction = 'created' | 'updated' | 'status_changed' | 'deleted';

/** Owner-only (+ admin bypass) CRUD for Applications, each bound to one Job Target the same user owns. */
@Injectable()
export class ApplicationService {
  constructor(
    private readonly applicationRepository: ApplicationRepository,
    private readonly jobTargetService: JobTargetService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async list(requestingUser: RequestUser, targetUserId: string): Promise<Application[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.applicationRepository.findAllByUserId(targetUserId);
  }

  async create(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateApplicationDto,
  ): Promise<Application> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    // A user may only create an application against a job target they own.
    await this.jobTargetService.assertOwnedJobTarget(requestingUser, targetUserId, dto.jobTargetId);

    const { jobTargetId, appliedAt, interviewDate, ...rest } = dto;
    const application = await this.applicationRepository.create(targetUserId, jobTargetId, {
      ...rest,
      appliedAt: appliedAt ? new Date(appliedAt) : undefined,
      interviewDate: interviewDate ? new Date(interviewDate) : undefined,
    });

    this.emit(targetUserId, application.id, 'created');
    return application;
  }

  async update(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: UpdateApplicationDto,
  ): Promise<Application> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);

    const { appliedAt, interviewDate, ...rest } = dto;
    const updated = await this.applicationRepository.update(id, {
      ...rest,
      appliedAt: appliedAt ? new Date(appliedAt) : undefined,
      interviewDate: interviewDate ? new Date(interviewDate) : undefined,
    });

    // "Application Status Changed" is its own history event, distinct from
    // the generic "updated" — fires only when this write actually changes
    // the status field.
    const statusChanged = dto.status !== undefined && dto.status !== existing.status;
    this.emit(targetUserId, id, statusChanged ? 'status_changed' : 'updated');

    return updated;
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.applicationRepository.softDelete(id);
    this.emit(targetUserId, id, 'deleted');
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<Application> {
    const application = await this.applicationRepository.findById(id);
    if (!application || application.userId !== targetUserId) {
      throw new NotFoundException('Application not found.');
    }
    return application;
  }

  private emit(userId: string, applicationId: string, action: ApplicationAction): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, 'application', applicationId, action),
    );
  }
}
