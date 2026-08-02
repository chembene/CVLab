import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ResumeVariantService } from './resume-variant.service';
import type { ResumeVariantRepository } from './resume-variant.repository';
import type { MasterResumeRepository } from '../master-resume/master-resume.repository';
import type { ResumeSectionsRepository } from '../resume-sections/resume-sections.repository';
import type { JobTargetService } from '../job-target/job-target.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('ResumeVariantService', () => {
  let variantRepository: jest.Mocked<ResumeVariantRepository>;
  let masterResumeRepository: jest.Mocked<MasterResumeRepository>;
  let sectionsRepository: jest.Mocked<ResumeSectionsRepository>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let eventEmitter: { emit: jest.Mock };
  let service: ResumeVariantService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  beforeEach(() => {
    variantRepository = {
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      applyEdit: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<ResumeVariantRepository>;
    masterResumeRepository = {
      findByUserId: jest.fn(),
    } as unknown as jest.Mocked<MasterResumeRepository>;
    sectionsRepository = {
      findAllByResumeId: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ResumeSectionsRepository>;
    jobTargetService = {
      assertOwnedJobTarget: jest.fn(),
    } as unknown as jest.Mocked<JobTargetService>;
    eventEmitter = { emit: jest.fn() };
    service = new ResumeVariantService(
      variantRepository,
      masterResumeRepository,
      sectionsRepository,
      jobTargetService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
    );
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound when the variant does not belong to the requested user', async () => {
      variantRepository.findById.mockResolvedValue({ id: 'rv-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'rv-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('throws NotFound when the user has no master resume yet', async () => {
      masterResumeRepository.findByUserId.mockResolvedValue(null);
      await expect(
        service.create(owner, 'user-1', { title: 'Variant' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('snapshots the master resume + all 11 sections into content, and verifies job target ownership when provided', async () => {
      masterResumeRepository.findByUserId.mockResolvedValue({
        id: 'mr-1',
        title: 'My Resume',
        summary: 'Summary',
        careerLevel: 'SENIOR',
        yearsExperience: 5,
        desiredPosition: 'Backend Engineer',
        desiredSalary: null,
        currency: 'MZN',
      } as never);
      jobTargetService.assertOwnedJobTarget.mockResolvedValue({ id: 'jt-1' } as never);
      variantRepository.create.mockResolvedValue({ id: 'rv-1' } as never);

      await service.create(owner, 'user-1', {
        title: 'Tailored Variant',
        jobTargetId: 'jt-1',
      } as never);

      expect(jobTargetService.assertOwnedJobTarget).toHaveBeenCalledWith(owner, 'user-1', 'jt-1');
      const call = variantRepository.create.mock.calls[0];
      expect(call).toBeDefined();
      const [userId, masterResumeId, data] = call!;
      expect(userId).toBe('user-1');
      expect(masterResumeId).toBe('mr-1');
      expect(data.title).toBe('Tailored Variant');
      const content = data.content as Record<string, unknown>;
      expect(content.summary).toBe('Summary');
      expect(content.workExperiences).toEqual([]);
      expect(content.references).toEqual([]);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'resume_variant', action: 'created' }),
      );
    });

    it('does not create when the optional job target is not owned by the target user', async () => {
      masterResumeRepository.findByUserId.mockResolvedValue({ id: 'mr-1' } as never);
      jobTargetService.assertOwnedJobTarget.mockRejectedValue(
        new NotFoundException('Job target not found.'),
      );

      await expect(
        service.create(owner, 'user-1', { title: 'x', jobTargetId: 'someone-elses-jt' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(variantRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('uses applyEdit (version bump), not update, and recomputes completion when content changes', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        title: 'Old title',
        content: { summary: 'old' },
        completionPercentage: 10,
      } as never);
      variantRepository.applyEdit.mockResolvedValue({ id: 'rv-1' } as never);

      await service.update(owner, 'user-1', 'rv-1', {
        content: { summary: 'new', workExperiences: [{}] },
      } as never);

      expect(variantRepository.applyEdit).toHaveBeenCalled();
      expect(variantRepository.update).not.toHaveBeenCalled();
      const [, data] = variantRepository.applyEdit.mock.calls[0]!;
      expect(data.completionPercentage).toBeGreaterThan(10);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'updated' }),
      );
    });

    it('leaves completionPercentage unchanged when neither title nor content is in the DTO', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        title: 'Title',
        content: {},
        completionPercentage: 42,
      } as never);
      variantRepository.applyEdit.mockResolvedValue({ id: 'rv-1' } as never);

      await service.update(owner, 'user-1', 'rv-1', { status: 'READY' } as never);

      const [, data] = variantRepository.applyEdit.mock.calls[0]!;
      expect(data.completionPercentage).toBe(42);
    });
  });

  describe('duplicate', () => {
    it('creates a brand new independent row copying the source content, and emits "created"', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        masterResumeId: 'mr-1',
        title: 'Original',
        jobTargetId: 'jt-1',
        content: { summary: 'x' },
        completionPercentage: 50,
      } as never);
      variantRepository.create.mockResolvedValue({ id: 'rv-2' } as never);

      await service.duplicate(owner, 'user-1', 'rv-1', {} as never);

      const call = variantRepository.create.mock.calls[0];
      const [, masterResumeId, data] = call!;
      expect(masterResumeId).toBe('mr-1');
      expect(data.title).toBe('Original (copy)');
      expect(data.status).toBe('DRAFT');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'created' }),
      );
    });

    it('uses the provided title override when given', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        masterResumeId: 'mr-1',
        title: 'Original',
        content: {},
        completionPercentage: 0,
      } as never);
      variantRepository.create.mockResolvedValue({ id: 'rv-2' } as never);

      await service.duplicate(owner, 'user-1', 'rv-1', { title: 'Custom name' } as never);

      const [, , data] = variantRepository.create.mock.calls[0]!;
      expect(data.title).toBe('Custom name');
    });
  });

  describe('archive / restore', () => {
    it('archives and emits "archived" on the first call', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        archived: false,
      } as never);
      variantRepository.update.mockResolvedValue({ id: 'rv-1', archived: true } as never);

      await service.archive(owner, 'user-1', 'rv-1');

      expect(variantRepository.update).toHaveBeenCalledWith('rv-1', { archived: true });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'archived' }),
      );
    });

    it('is idempotent — archiving an already-archived variant is a no-op with no event', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        archived: true,
      } as never);

      await service.archive(owner, 'user-1', 'rv-1');

      expect(variantRepository.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('restores and emits "restored"', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        archived: true,
      } as never);
      variantRepository.update.mockResolvedValue({ id: 'rv-1', archived: false } as never);

      await service.restore(owner, 'user-1', 'rv-1');

      expect(variantRepository.update).toHaveBeenCalledWith('rv-1', { archived: false });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'restored' }),
      );
    });

    it('is idempotent — restoring an already-active variant is a no-op with no event', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        archived: false,
      } as never);

      await service.restore(owner, 'user-1', 'rv-1');

      expect(variantRepository.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes and emits "deleted"', async () => {
      variantRepository.findById.mockResolvedValue({ id: 'rv-1', userId: 'user-1' } as never);

      await service.remove(owner, 'user-1', 'rv-1');

      expect(variantRepository.softDelete).toHaveBeenCalledWith('rv-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'deleted' }),
      );
    });
  });

  describe('assertOwnedVariant', () => {
    it('throws NotFound for a variant owned by someone else', async () => {
      variantRepository.findById.mockResolvedValue({ id: 'rv-1', userId: 'someone-else' } as never);
      await expect(service.assertOwnedVariant(owner, 'user-1', 'rv-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
