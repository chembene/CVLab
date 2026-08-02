import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, UserRole } from '@prisma/client';
import { ApplicationService } from './application.service';
import type { ApplicationRepository } from './application.repository';
import type { JobTargetService } from '../job-target/job-target.service';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('ApplicationService', () => {
  let repository: jest.Mocked<ApplicationRepository>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let eventEmitter: { emit: jest.Mock };
  let service: ApplicationService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  beforeEach(() => {
    repository = {
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<ApplicationRepository>;
    jobTargetService = {
      assertOwnedJobTarget: jest.fn(),
    } as unknown as jest.Mocked<JobTargetService>;
    resumeVariantService = {
      assertOwnedVariant: jest.fn(),
    } as unknown as jest.Mocked<ResumeVariantService>;
    eventEmitter = { emit: jest.fn() };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new ApplicationService(
      repository,
      jobTargetService,
      resumeVariantService,
      eventEmitter as any,
    );
  });

  describe('list', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('create', () => {
    it('verifies job target ownership before creating, and converts date strings', async () => {
      jobTargetService.assertOwnedJobTarget.mockResolvedValue({ id: 'jt-1' } as never);
      repository.create.mockResolvedValue({ id: 'app-1' } as never);

      await service.create(owner, 'user-1', {
        jobTargetId: 'jt-1',
        appliedAt: '2026-08-01',
      } as never);

      expect(jobTargetService.assertOwnedJobTarget).toHaveBeenCalledWith(owner, 'user-1', 'jt-1');
      const call = repository.create.mock.calls[0];
      expect(call).toBeDefined();
      expect(call?.[2].appliedAt).toBeInstanceOf(Date);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'application', action: 'created' }),
      );
    });

    it('does not create when the referenced job target is not owned by the target user', async () => {
      jobTargetService.assertOwnedJobTarget.mockRejectedValue(
        new NotFoundException('Job target not found.'),
      );

      await expect(
        service.create(owner, 'user-1', { jobTargetId: 'someone-elses-jt' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('verifies resume variant ownership when resumeVariantId is provided', async () => {
      jobTargetService.assertOwnedJobTarget.mockResolvedValue({ id: 'jt-1' } as never);
      resumeVariantService.assertOwnedVariant.mockResolvedValue({ id: 'rv-1' } as never);
      repository.create.mockResolvedValue({ id: 'app-1' } as never);

      await service.create(owner, 'user-1', {
        jobTargetId: 'jt-1',
        resumeVariantId: 'rv-1',
      } as never);

      expect(resumeVariantService.assertOwnedVariant).toHaveBeenCalledWith(owner, 'user-1', 'rv-1');
    });

    it('does not create when the referenced resume variant is not owned by the target user', async () => {
      jobTargetService.assertOwnedJobTarget.mockResolvedValue({ id: 'jt-1' } as never);
      resumeVariantService.assertOwnedVariant.mockRejectedValue(
        new NotFoundException('Resume variant not found.'),
      );

      await expect(
        service.create(owner, 'user-1', {
          jobTargetId: 'jt-1',
          resumeVariantId: 'someone-elses-rv',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('skips resume variant ownership check when resumeVariantId is absent', async () => {
      jobTargetService.assertOwnedJobTarget.mockResolvedValue({ id: 'jt-1' } as never);
      repository.create.mockResolvedValue({ id: 'app-1' } as never);

      await service.create(owner, 'user-1', { jobTargetId: 'jt-1' } as never);

      expect(resumeVariantService.assertOwnedVariant).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('emits "status_changed" when the status field actually changes', async () => {
      repository.findById.mockResolvedValue({
        id: 'app-1',
        userId: 'user-1',
        status: ApplicationStatus.SAVED,
      } as never);
      repository.update.mockResolvedValue({ id: 'app-1' } as never);

      await service.update(owner, 'user-1', 'app-1', {
        status: ApplicationStatus.APPLIED,
      } as never);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'status_changed' }),
      );
    });

    it('emits "updated" when status is unchanged (or absent)', async () => {
      repository.findById.mockResolvedValue({
        id: 'app-1',
        userId: 'user-1',
        status: ApplicationStatus.SAVED,
      } as never);
      repository.update.mockResolvedValue({ id: 'app-1' } as never);

      await service.update(owner, 'user-1', 'app-1', { notes: 'follow up next week' } as never);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'updated' }),
      );
    });

    it('emits "updated", not "status_changed", when the DTO status equals the current status', async () => {
      repository.findById.mockResolvedValue({
        id: 'app-1',
        userId: 'user-1',
        status: ApplicationStatus.SAVED,
      } as never);
      repository.update.mockResolvedValue({ id: 'app-1' } as never);

      await service.update(owner, 'user-1', 'app-1', { status: ApplicationStatus.SAVED } as never);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'updated' }),
      );
    });

    it('throws NotFound for an application belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'app-1', userId: 'someone-else' } as never);

      await expect(service.update(owner, 'user-1', 'app-1', {} as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes and emits "deleted"', async () => {
      repository.findById.mockResolvedValue({ id: 'app-1', userId: 'user-1' } as never);

      await service.remove(owner, 'user-1', 'app-1');

      expect(repository.softDelete).toHaveBeenCalledWith('app-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'deleted' }),
      );
    });
  });
});
