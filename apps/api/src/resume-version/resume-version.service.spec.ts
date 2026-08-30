import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ResumeVersionService } from './resume-version.service';
import { ResumeDiffService } from './resume-diff.service';
import type { ResumeVersionRepository } from './resume-version.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('ResumeVersionService', () => {
  let versionRepository: jest.Mocked<ResumeVersionRepository>;
  let diffService: ResumeDiffService;
  let service: ResumeVersionService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  beforeEach(() => {
    versionRepository = {
      create: jest.fn(),
      findAllByVariantId: jest.fn(),
      findOneByVariantAndNumber: jest.fn(),
      findLatestByVariantId: jest.fn(),
      findOneByVariantAndNumberUnfiltered: jest.fn(),
    } as unknown as jest.Mocked<ResumeVersionRepository>;
    diffService = new ResumeDiffService();
    service = new ResumeVersionService(versionRepository, diffService);
  });

  describe('listTimeline', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.listTimeline(stranger, 'user-1', 'rv-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(versionRepository.findAllByVariantId).not.toHaveBeenCalled();
    });

    it('delegates to the owner-filtered repository query', async () => {
      versionRepository.findAllByVariantId.mockResolvedValue([{ id: 'v-1' } as never]);
      const result = await service.listTimeline(owner, 'user-1', 'rv-1');
      expect(versionRepository.findAllByVariantId).toHaveBeenCalledWith('rv-1', 'user-1');
      expect(result).toEqual([{ id: 'v-1' }]);
    });
  });

  describe('getOne', () => {
    it('throws NotFound when no matching version exists for this owner', async () => {
      versionRepository.findOneByVariantAndNumber.mockResolvedValue(null);
      await expect(service.getOne(owner, 'user-1', 'rv-1', 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('returns the version when found', async () => {
      versionRepository.findOneByVariantAndNumber.mockResolvedValue({
        id: 'v-1',
        versionNumber: 2,
      } as never);
      const result = await service.getOne(owner, 'user-1', 'rv-1', 2);
      expect(result).toEqual({ id: 'v-1', versionNumber: 2 });
    });
  });

  describe('compare', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.compare(stranger, 'user-1', 'rv-1', 1, 2)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('throws NotFound when either version does not belong to the requesting owner', async () => {
      versionRepository.findOneByVariantAndNumber
        .mockResolvedValueOnce({ id: 'v-1', versionNumber: 1, content: {} } as never)
        .mockResolvedValueOnce(null);

      await expect(service.compare(owner, 'user-1', 'rv-1', 1, 2)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('runs the diff between the two versions content', async () => {
      versionRepository.findOneByVariantAndNumber
        .mockResolvedValueOnce({
          id: 'v-1',
          versionNumber: 1,
          content: { summary: 'old' },
        } as never)
        .mockResolvedValueOnce({
          id: 'v-2',
          versionNumber: 2,
          content: { summary: 'new' },
        } as never);

      const result = await service.compare(owner, 'user-1', 'rv-1', 1, 2);

      expect(result.fromVersion).toBe(1);
      expect(result.toVersion).toBe(2);
      const summarySection = result.sections.find((s) => s.section === 'summary');
      expect(summarySection?.status).toBe('changed');
    });
  });
});
