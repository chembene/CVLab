import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { Profile } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import { ResumeCompletionService } from '../resume-completion/resume-completion.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ProfileRepository } from './profile.repository';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class ProfileService {
  constructor(
    private readonly profileRepository: ProfileRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly completionService: ResumeCompletionService,
  ) {}

  async getForUser(requestingUser: RequestUser, targetUserId: string): Promise<Profile | null> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.profileRepository.findByUserId(targetUserId);
  }

  async upsertForUser(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: UpdateProfileDto,
  ): Promise<Profile> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const existing = await this.profileRepository.findByUserId(targetUserId);
    const profile = await this.profileRepository.upsert(targetUserId, {
      ...dto,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
    });

    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(
        targetUserId,
        'profile',
        profile.id,
        existing ? 'updated' : 'created',
      ),
    );
    await this.completionService.recalculate(targetUserId);

    return profile;
  }
}
