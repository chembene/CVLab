import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ResumeSectionsService } from './resume-sections.service';
import type { ResumeSectionsRepository, SectionRecord } from './resume-sections.repository';
import type { MasterResumeRepository } from '../master-resume/master-resume.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

function buildRecord(overrides: Partial<SectionRecord> = {}): SectionRecord {
  return {
    id: 'section-1',
    resumeId: 'resume-1',
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  };
}

describe('ResumeSectionsService', () => {
  let sectionsRepository: jest.Mocked<ResumeSectionsRepository>;
  let masterResumeRepository: jest.Mocked<MasterResumeRepository>;
  let eventEmitter: { emit: jest.Mock };
  let completionService: { recalculate: jest.Mock };
  let service: ResumeSectionsService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  beforeEach(() => {
    sectionsRepository = {
      findAllByResumeId: jest.fn(),
      findById: jest.fn(),
      findActiveMatchingFields: jest.fn(),
      countActive: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<ResumeSectionsRepository>;

    masterResumeRepository = {
      findByUserId: jest.fn().mockResolvedValue({ id: 'resume-1' }),
    } as unknown as jest.Mocked<MasterResumeRepository>;

    eventEmitter = { emit: jest.fn() };
    completionService = { recalculate: jest.fn() };

    service = new ResumeSectionsService(
      sectionsRepository,
      masterResumeRepository,
      eventEmitter as any,
      completionService as any,
    );
  });

  describe('authorization and resume resolution', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list('skills', stranger, 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('requires a master resume to exist before touching sections', async () => {
      masterResumeRepository.findByUserId.mockResolvedValue(null);
      await expect(service.list('skills', owner, 'user-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('auto-assigns displayOrder to the current active count when not provided', async () => {
      sectionsRepository.countActive.mockResolvedValue(2);
      sectionsRepository.create.mockResolvedValue(buildRecord({ displayOrder: 2 }));

      await service.create('projects', owner, 'user-1', { title: 'My Project' });

      expect(sectionsRepository.create).toHaveBeenCalledWith('projects', 'resume-1', {
        title: 'My Project',
        displayOrder: 2,
      });
    });

    it('respects an explicitly provided displayOrder', async () => {
      sectionsRepository.create.mockResolvedValue(buildRecord());
      await service.create('projects', owner, 'user-1', { title: 'X', displayOrder: 5 });
      expect(sectionsRepository.countActive).not.toHaveBeenCalled();
      expect(sectionsRepository.create).toHaveBeenCalledWith('projects', 'resume-1', {
        title: 'X',
        displayOrder: 5,
      });
    });

    it('rejects a duplicate skill (case-insensitive) on the same resume', async () => {
      sectionsRepository.findActiveMatchingFields.mockResolvedValue(
        buildRecord({ id: 'existing-skill' }),
      );

      await expect(
        service.create('skills', owner, 'user-1', { name: 'JavaScript' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(sectionsRepository.create).not.toHaveBeenCalled();
    });

    it('rejects duplicate education by institution+degree', async () => {
      sectionsRepository.findActiveMatchingFields.mockResolvedValue(buildRecord());
      await expect(
        service.create('education', owner, 'user-1', { institution: 'MIT', degree: 'BSc' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not duplicate-check section types with no duplicateCheckFields (e.g. work experience)', async () => {
      sectionsRepository.create.mockResolvedValue(buildRecord());
      await service.create('work-experience', owner, 'user-1', {
        company: 'Acme',
        position: 'Engineer',
      });
      expect(sectionsRepository.findActiveMatchingFields).not.toHaveBeenCalled();
    });

    it('emits a "created" event and recalculates completion after a successful create', async () => {
      sectionsRepository.create.mockResolvedValue(buildRecord({ id: 'skill-1' }));
      await service.create('skills', owner, 'user-1', { name: 'TypeScript' });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'skill', action: 'created', entityId: 'skill-1' }),
      );
      expect(completionService.recalculate).toHaveBeenCalledWith('user-1');
    });
  });

  describe('update', () => {
    it('throws NotFound when the section item does not belong to the caller’s resume', async () => {
      sectionsRepository.findById.mockResolvedValue(
        buildRecord({ resumeId: 'someone-elses-resume' }),
      );
      await expect(
        service.update('skills', owner, 'user-1', 'section-1', { name: 'Go' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows updating a duplicate-checked field to its own existing value (excludes itself from the check)', async () => {
      sectionsRepository.findById.mockResolvedValue(
        buildRecord({ id: 'skill-1', resumeId: 'resume-1' }),
      );
      sectionsRepository.findActiveMatchingFields.mockResolvedValue(
        buildRecord({ id: 'skill-1', resumeId: 'resume-1' }),
      );
      sectionsRepository.update.mockResolvedValue(buildRecord({ id: 'skill-1' }));

      await expect(
        service.update('skills', owner, 'user-1', 'skill-1', { name: 'JavaScript' }),
      ).resolves.toBeDefined();
    });

    it('rejects renaming a skill to collide with a different existing skill', async () => {
      sectionsRepository.findById.mockResolvedValue(
        buildRecord({ id: 'skill-1', resumeId: 'resume-1' }),
      );
      sectionsRepository.findActiveMatchingFields.mockResolvedValue(
        buildRecord({ id: 'skill-2', resumeId: 'resume-1' }),
      );

      await expect(
        service.update('skills', owner, 'user-1', 'skill-1', { name: 'JavaScript' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('soft-deletes (never hard-deletes) an owned section item', async () => {
      sectionsRepository.findById.mockResolvedValue(buildRecord({ resumeId: 'resume-1' }));
      await service.remove('skills', owner, 'user-1', 'section-1');
      expect(sectionsRepository.softDelete).toHaveBeenCalledWith('skills', 'section-1');
    });

    it('throws NotFound for a section item belonging to another resume', async () => {
      sectionsRepository.findById.mockResolvedValue(
        buildRecord({ resumeId: 'someone-elses-resume' }),
      );
      await expect(service.remove('skills', owner, 'user-1', 'section-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(sectionsRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('reorder', () => {
    it('rejects reordering when an id does not belong to the resume', async () => {
      sectionsRepository.findAllByResumeId.mockResolvedValue([
        buildRecord({ id: 'a' }),
        buildRecord({ id: 'b' }),
      ]);
      await expect(
        service.reorder('skills', owner, 'user-1', ['a', 'not-mine']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('assigns sequential displayOrder matching the given order', async () => {
      sectionsRepository.findAllByResumeId
        .mockResolvedValueOnce([
          buildRecord({ id: 'a' }),
          buildRecord({ id: 'b' }),
          buildRecord({ id: 'c' }),
        ])
        .mockResolvedValueOnce([]);

      await service.reorder('skills', owner, 'user-1', ['c', 'a', 'b']);

      expect(sectionsRepository.update).toHaveBeenCalledWith('skills', 'c', { displayOrder: 0 });
      expect(sectionsRepository.update).toHaveBeenCalledWith('skills', 'a', { displayOrder: 1 });
      expect(sectionsRepository.update).toHaveBeenCalledWith('skills', 'b', { displayOrder: 2 });
    });
  });
});
