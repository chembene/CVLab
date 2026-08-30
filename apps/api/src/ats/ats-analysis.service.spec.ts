import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AtsAnalysisService } from './ats-analysis.service';
import type { AtsReportRepository } from './ats-report.repository';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { JobTargetService } from '../job-target/job-target.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('AtsAnalysisService', () => {
  let repository: jest.Mocked<AtsReportRepository>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let eventEmitter: { emit: jest.Mock };
  let service: AtsAnalysisService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  beforeEach(() => {
    repository = {
      findAllByUserId: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<AtsReportRepository>;
    resumeVariantService = {
      getOne: jest.fn(),
      snapshotBeforeAiAction: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ResumeVariantService>;
    jobTargetService = {
      getOne: jest.fn(),
    } as unknown as jest.Mocked<JobTargetService>;
    eventEmitter = { emit: jest.fn() };
    service = new AtsAnalysisService(
      repository,
      resumeVariantService,
      jobTargetService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
    );
  });

  describe('run', () => {
    it('denies a non-owner, non-admin user before touching the variant', async () => {
      await expect(
        service.run(stranger, 'user-1', { resumeVariantId: 'rv-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(resumeVariantService.getOne).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the resume variant has no linked job target', async () => {
      resumeVariantService.getOne.mockResolvedValue({ id: 'rv-1', jobTargetId: null } as never);

      await expect(
        service.run(owner, 'user-1', { resumeVariantId: 'rv-1' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(jobTargetService.getOne).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('runs the deterministic engine end-to-end and persists + emits "created"', async () => {
      resumeVariantService.getOne.mockResolvedValue({
        id: 'rv-1',
        jobTargetId: 'jt-1',
        completionPercentage: 75,
        content: {
          summary: 'An experienced backend engineer who ships Power BI dashboards. '.padEnd(
            50,
            '.',
          ),
          yearsExperience: 6,
          workExperiences: [{ company: 'Acme', description: 'Led the backend team.' }],
          educations: [{ institution: 'MIT' }],
          skills: [{ name: 'TypeScript' }],
          languages: [{ language: 'English' }],
        },
      } as never);
      jobTargetService.getOne.mockResolvedValue({
        id: 'jt-1',
        seniority: 'Senior Backend Engineer',
        keywords: [{ keyword: 'Power BI' }, { keyword: 'Kubernetes' }],
        skills: [
          { skill: 'TypeScript', required: true },
          { skill: 'Docker', required: false },
        ],
        languages: [{ language: 'English' }],
      } as never);
      repository.create.mockResolvedValue({ id: 'report-1' } as never);

      const result = await service.run(owner, 'user-1', { resumeVariantId: 'rv-1' });

      expect(result).toEqual({ id: 'report-1' });
      expect(repository.create).toHaveBeenCalledTimes(1);
      const [userId, resumeVariantId, jobTargetId, data] = repository.create.mock.calls[0]!;
      expect(userId).toBe('user-1');
      expect(resumeVariantId).toBe('rv-1');
      expect(jobTargetId).toBe('jt-1');
      expect(data.matchedKeywords).toEqual(['Power BI']);
      expect(data.missingKeywords).toEqual(['Kubernetes']);
      expect(data.recommendedSkills).toEqual(['Docker']);
      expect(data.completionScore).toBe(75);
      expect(data.overallScore).toBeGreaterThan(0);
      expect(data.overallScore).toBeLessThanOrEqual(100);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({
          entityType: 'ats_report',
          action: 'created',
          entityId: 'report-1',
        }),
      );
    });

    it('auto-snapshots the resume state before running the analysis (Phase 10.5 rule 8, "before ATS rewrite")', async () => {
      resumeVariantService.getOne.mockResolvedValue({
        id: 'rv-1',
        jobTargetId: 'jt-1',
        completionPercentage: 75,
        content: {},
      } as never);
      jobTargetService.getOne.mockResolvedValue({
        id: 'jt-1',
        seniority: 'Mid',
        keywords: [],
        skills: [],
        languages: [],
      } as never);
      repository.create.mockResolvedValue({ id: 'report-1' } as never);

      await service.run(owner, 'user-1', { resumeVariantId: 'rv-1' });

      expect(resumeVariantService.snapshotBeforeAiAction).toHaveBeenCalledWith(
        owner,
        'user-1',
        'rv-1',
        expect.objectContaining({ jobTargetId: 'jt-1' }),
      );
    });
  });

  describe('list / getOne', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.list(stranger, 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for a report belonging to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'report-1', userId: 'someone-else' } as never);
      await expect(service.getOne(owner, 'user-1', 'report-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes and emits "deleted"', async () => {
      repository.findById.mockResolvedValue({ id: 'report-1', userId: 'user-1' } as never);

      await service.remove(owner, 'user-1', 'report-1');

      expect(repository.delete).toHaveBeenCalledWith('report-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'ats_report', action: 'deleted' }),
      );
    });

    it('throws NotFound instead of deleting when the report belongs to another user', async () => {
      repository.findById.mockResolvedValue({ id: 'report-1', userId: 'someone-else' } as never);

      await expect(service.remove(owner, 'user-1', 'report-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
