import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JobImportService, JOB_IMPORT_CONFIDENCE_THRESHOLD } from './job-import.service';
import type { JobFetcher } from './job-fetcher';
import type { ParserRegistry } from './parser-registry';
import type { JobImportRepository } from './job-import.repository';
import type { JobTargetService } from '../job-target/job-target.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import type { JobParser, ParsedJobData } from './interfaces/job-parser.interface';

describe('JobImportService', () => {
  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const baseData: ParsedJobData = {
    title: 'Backend Engineer',
    company: 'Acme Corp',
    companyLogoUrl: 'https://acme.example.com/logo.png',
    location: 'Maputo',
    employmentType: 'Full Time',
    seniority: 'Senior',
    responsibilities: ['Ship features'],
    requirements: ['5 years experience'],
    niceToHave: [],
    languages: ['English'],
    benefits: ['Health insurance'],
    skills: ['Excel'],
    technologies: ['TypeScript'],
    salaryMin: 80000,
    salaryMax: 100000,
    currency: 'USD',
    salaryPeriod: 'YEARLY',
    experienceMinYears: 5,
    educationLevel: 'Bachelor',
    description: 'Full description text.',
  };
  const highConfidence = { title: 0.9, company: 0.85, description: 0.85 };

  let fetcher: jest.Mocked<JobFetcher>;
  let registry: jest.Mocked<ParserRegistry>;
  let repository: jest.Mocked<JobImportRepository>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let eventEmitter: { emit: jest.Mock };
  let parser: jest.Mocked<JobParser>;
  let service: JobImportService;

  beforeEach(() => {
    fetcher = {
      fetchHtml: jest.fn().mockResolvedValue({
        html: '<html></html>',
        finalUrl: 'https://boards.greenhouse.io/acme/jobs/1',
      }),
    } as unknown as jest.Mocked<JobFetcher>;

    parser = {
      name: 'greenhouse',
      canHandle: jest.fn().mockReturnValue(true),
      parse: jest.fn().mockReturnValue({ data: baseData, confidence: highConfidence }),
    };

    registry = {
      select: jest.fn().mockReturnValue(parser),
    } as unknown as jest.Mocked<ParserRegistry>;
    repository = {
      create: jest.fn().mockResolvedValue({}),
      findByJobTargetId: jest.fn(),
      findLatestBySourceUrl: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<JobImportRepository>;
    jobTargetService = {
      create: jest.fn().mockResolvedValue({ id: 'jt-1', userId: owner.id }),
      assertOwnedJobTarget: jest.fn().mockResolvedValue({ id: 'jt-1', userId: owner.id }),
    } as unknown as jest.Mocked<JobTargetService>;
    eventEmitter = { emit: jest.fn() };

    service = new JobImportService(
      fetcher,
      registry,
      repository,
      jobTargetService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
    );
  });

  describe('importFromUrl', () => {
    it('fetches, parses, and creates a JobTarget with status READY when confidence is high', async () => {
      const result = await service.importFromUrl(owner, owner.id, {
        url: 'https://boards.greenhouse.io/acme/jobs/1',
      });

      expect(fetcher.fetchHtml).toHaveBeenCalledWith('https://boards.greenhouse.io/acme/jobs/1');
      expect(registry.select).toHaveBeenCalledWith('boards.greenhouse.io');
      expect(jobTargetService.create).toHaveBeenCalledWith(
        owner,
        owner.id,
        expect.objectContaining({
          title: 'Backend Engineer',
          company: 'Acme Corp',
          status: 'READY',
          source: 'greenhouse',
          skills: [
            { skill: 'Excel', required: false },
            { skill: 'TypeScript', required: false },
          ],
          languages: [{ language: 'English' }],
        }),
      );
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          jobTargetId: 'jt-1',
          provider: 'greenhouse',
          companyLogoUrl: 'https://acme.example.com/logo.png',
          overallConfidence: expect.any(Number),
        }),
      );
      expect(result.overallConfidence).toBeGreaterThan(JOB_IMPORT_CONFIDENCE_THRESHOLD);
      expect(result.reusedExisting).toBe(false);
    });

    it('deduplicates a skill that appears in both skills and technologies', async () => {
      parser.parse.mockReturnValue({
        data: { ...baseData, skills: ['TypeScript', 'Excel'], technologies: ['TypeScript'] },
        confidence: highConfidence,
      });

      await service.importFromUrl(owner, owner.id, {
        url: 'https://boards.greenhouse.io/acme/jobs/1',
      });

      const createCall = jobTargetService.create.mock.calls[0]?.[2];
      expect(createCall?.skills).toEqual([
        { skill: 'TypeScript', required: false },
        { skill: 'Excel', required: false },
      ]);
    });

    it('marks the JobTarget REQUIRES_REVIEW when overall confidence is below the threshold', async () => {
      parser.parse.mockReturnValue({ data: baseData, confidence: { title: 0.3 } });

      await service.importFromUrl(owner, owner.id, { url: 'https://example.com/job' });

      expect(jobTargetService.create).toHaveBeenCalledWith(
        owner,
        owner.id,
        expect.objectContaining({ status: 'REQUIRES_REVIEW' }),
      );
    });

    it('falls back to "Untitled Position" when the parser found no title', async () => {
      parser.parse.mockReturnValue({ data: { ...baseData, title: undefined }, confidence: {} });

      await service.importFromUrl(owner, owner.id, { url: 'https://example.com/job' });

      expect(jobTargetService.create).toHaveBeenCalledWith(
        owner,
        owner.id,
        expect.objectContaining({ title: 'Untitled Position' }),
      );
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(
        service.importFromUrl(stranger, owner.id, { url: 'https://example.com/job' }),
      ).rejects.toThrow(ForbiddenException);
      expect(fetcher.fetchHtml).not.toHaveBeenCalled();
    });

    it('folds responsibilities/requirements/niceToHave/benefits into the stored job description', async () => {
      await service.importFromUrl(owner, owner.id, { url: 'https://example.com/job' });

      const createCall = jobTargetService.create.mock.calls[0]?.[2];
      expect(createCall?.jobDescription).toContain('Responsibilities:');
      expect(createCall?.jobDescription).toContain('Ship features');
      expect(createCall?.jobDescription).toContain('Requirements:');
    });

    describe('duplicate detection (rule 13)', () => {
      const existingExtractedAt = new Date('2026-01-01T00:00:00Z');
      const cachedRow = {
        id: 'jim-original',
        sourceUrl: 'https://boards.greenhouse.io/acme/jobs/1',
        provider: 'greenhouse',
        rawHtml: '<html>cached</html>',
        extractedData: baseData,
        fieldConfidence: highConfidence,
        overallConfidence: 0.85,
        extractedAt: existingExtractedAt,
      };

      it('reuses a prior extraction of the same URL instead of fetching again', async () => {
        repository.findLatestBySourceUrl.mockResolvedValue(cachedRow as never);

        const result = await service.importFromUrl(owner, owner.id, { url: cachedRow.sourceUrl });

        expect(fetcher.fetchHtml).not.toHaveBeenCalled();
        expect(registry.select).not.toHaveBeenCalled();
        expect(result.reusedExisting).toBe(true);
        expect(repository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            duplicateOfId: 'jim-original',
            extractedAt: existingExtractedAt,
          }),
        );
      });

      it('still creates a brand-new JobTarget row for the requesting user when reusing', async () => {
        repository.findLatestBySourceUrl.mockResolvedValue(cachedRow as never);

        await service.importFromUrl(owner, owner.id, { url: cachedRow.sourceUrl });

        expect(jobTargetService.create).toHaveBeenCalledWith(
          owner,
          owner.id,
          expect.objectContaining({ title: 'Backend Engineer' }),
        );
      });
    });
  });

  describe('getImportMetadata', () => {
    it('verifies ownership before reading the metadata row', async () => {
      await service.getImportMetadata(owner, owner.id, 'jt-1');
      expect(jobTargetService.assertOwnedJobTarget).toHaveBeenCalledWith(owner, owner.id, 'jt-1');
      expect(repository.findByJobTargetId).toHaveBeenCalledWith('jt-1');
    });
  });
});
