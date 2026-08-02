import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { MasterResumeService } from './master-resume.service';
import type { MasterResumeRepository } from './master-resume.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('MasterResumeService', () => {
  let repository: jest.Mocked<MasterResumeRepository>;
  let eventEmitter: { emit: jest.Mock };
  let completionService: { recalculate: jest.Mock };
  let service: MasterResumeService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  beforeEach(() => {
    repository = {
      findByUserId: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<MasterResumeRepository>;
    eventEmitter = { emit: jest.fn() };
    completionService = { recalculate: jest.fn() };
    service = new MasterResumeService(repository, eventEmitter as any, completionService as any);
  });

  describe('createForUser', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.createForUser(stranger, 'user-1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws Conflict when a resume already exists for the user', async () => {
      repository.findByUserId.mockResolvedValue({ id: 'resume-1' } as any);

      await expect(service.createForUser(owner, 'user-1', {})).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('creates with sensible defaults and triggers the changed event + completion recalculation', async () => {
      repository.findByUserId.mockResolvedValue(null);
      repository.create.mockResolvedValue({ id: 'resume-1' } as any);

      await service.createForUser(owner, 'user-1', { title: 'My Resume' });

      expect(repository.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          status: 'DRAFT',
          currency: 'MZN',
          visibility: 'PRIVATE',
          title: 'My Resume',
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'created', entityType: 'master_resume' }),
      );
      expect(completionService.recalculate).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateForUser', () => {
    it('throws NotFound when no resume exists yet', async () => {
      repository.findByUserId.mockResolvedValue(null);

      await expect(service.updateForUser(owner, 'user-1', { title: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('updates an existing resume and triggers the changed event + completion recalculation', async () => {
      repository.findByUserId.mockResolvedValue({ id: 'resume-1' } as any);
      repository.update.mockResolvedValue({ id: 'resume-1' } as any);

      await service.updateForUser(owner, 'user-1', { summary: 'Updated summary' });

      expect(repository.update).toHaveBeenCalledWith('resume-1', { summary: 'Updated summary' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'updated' }),
      );
      expect(completionService.recalculate).toHaveBeenCalledWith('user-1');
    });
  });
});
