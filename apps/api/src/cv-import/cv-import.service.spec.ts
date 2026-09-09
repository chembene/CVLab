import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CvImportService } from './cv-import.service';
import type { CvImportRepository } from './cv-import.repository';
import type { CVParser } from './cv-parser';
import type { ProfileService } from '../profile/profile.service';
import type { MasterResumeService } from '../master-resume/master-resume.service';
import type { ResumeSectionsService } from '../resume-sections/resume-sections.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import type { AiOrchestrationService } from '../ai-orchestration/pipeline/ai-orchestration.service';
import { AIFeature } from '../ai-orchestration/constants/ai-feature.enum';

describe('CvImportService', () => {
  let repository: jest.Mocked<CvImportRepository>;
  let parser: jest.Mocked<CVParser>;
  let profileService: jest.Mocked<ProfileService>;
  let masterResumeService: jest.Mocked<MasterResumeService>;
  let sectionsService: jest.Mocked<ResumeSectionsService>;
  let eventEmitter: { emit: jest.Mock };
  let aiOrchestrationService: jest.Mocked<AiOrchestrationService>;
  let service: CvImportService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const parsedData = {
    personalData: { fullName: 'Maria Sitoe', email: 'maria@example.com', phone: '+258841234567' },
    summary: 'Experienced engineer.',
    workExperiences: [
      {
        company: 'TechCorp',
        position: 'Engineer',
        startDate: '2020-01-01',
        currentlyWorking: true,
      },
      { position: 'Untitled', company: undefined, startDate: undefined },
    ],
    educations: [{ institution: 'UEM', degree: 'BSc' }],
    skills: [{ name: 'TypeScript' }],
    languages: [{ language: 'Portuguese' }],
    certificates: [{ title: 'AWS Certified' }],
    projects: [{ title: 'Portfolio site' }],
    awards: [{ title: 'Employee of the Year', issuer: 'Acme' }],
    volunteerExperiences: [{ organization: 'Red Cross', role: 'Volunteer' }],
    references: [{ name: 'João Silva', email: 'joao@example.com' }],
  };

  const cvImportRow = {
    id: 'cvi-1',
    userId: owner.id,
    fileName: 'cv.pdf',
    fileType: 'PDF',
    status: 'EXTRACTED',
    extractedData: parsedData,
    fieldConfidence: { 'personalData.email': 0.95 },
    masterResumeId: null,
  };

  beforeEach(() => {
    repository = {
      create: jest.fn().mockResolvedValue(cvImportRow),
      findAllByUserId: jest.fn(),
      findById: jest.fn().mockResolvedValue(cvImportRow),
      update: jest
        .fn()
        .mockImplementation((id, data) => Promise.resolve({ ...cvImportRow, ...data })),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<CvImportRepository>;

    parser = {
      extractText: jest.fn().mockResolvedValue('raw text'),
      parse: jest.fn().mockReturnValue({ data: parsedData, confidence: {}, rawText: 'raw text' }),
    } as unknown as jest.Mocked<CVParser>;

    profileService = {
      upsertForUser: jest.fn().mockResolvedValue({}),
    } as unknown as jest.Mocked<ProfileService>;
    masterResumeService = {
      getForUser: jest.fn().mockResolvedValue(null),
      createForUser: jest.fn().mockResolvedValue({ id: 'mr-1' }),
      updateForUser: jest.fn().mockResolvedValue({ id: 'mr-1' }),
    } as unknown as jest.Mocked<MasterResumeService>;
    sectionsService = {
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      list: jest.fn().mockResolvedValue([]),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ResumeSectionsService>;
    eventEmitter = { emit: jest.fn() };

    aiOrchestrationService = {
      execute: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          fieldSuggestions: [
            {
              section: 'workExperiences',
              index: 0,
              field: 'position',
              originalValue: 'Engineer',
              suggestedValue: 'Software Engineer',
              reason: 'More specific and standard title.',
              confidence: 0.8,
            },
          ],
          unresolvedFields: [],
        }),
        creditsCharged: 30,
        aiRequestId: 'ai-req-1',
      }),
    } as unknown as jest.Mocked<AiOrchestrationService>;

    service = new CvImportService(
      repository,
      parser,
      profileService,
      masterResumeService,
      sectionsService,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
      aiOrchestrationService,
    );
  });

  describe('upload', () => {
    const file = {
      originalname: 'cv.pdf',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('%PDF-1.4'),
    } as Express.Multer.File;

    it('parses the file and creates an EXTRACTED CvImport row without touching Profile/MasterResume', async () => {
      const result = await service.upload(owner, owner.id, file);

      expect(parser.extractText).toHaveBeenCalledWith(file.buffer, 'PDF');
      expect(repository.create).toHaveBeenCalledWith(
        owner.id,
        expect.objectContaining({ status: 'EXTRACTED', fileName: 'cv.pdf' }),
      );
      expect(profileService.upsertForUser).not.toHaveBeenCalled();
      expect(masterResumeService.createForUser).not.toHaveBeenCalled();
      expect(result).toEqual(cvImportRow);
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(service.upload(stranger, owner.id, file)).rejects.toThrow(ForbiddenException);
    });

    it('rejects missing files', async () => {
      await expect(service.upload(owner, owner.id, undefined)).rejects.toThrow(BadRequestException);
    });

    it('rejects unsupported mime types', async () => {
      const badFile = { ...file, mimetype: 'image/png' } as Express.Multer.File;
      await expect(service.upload(owner, owner.id, badFile)).rejects.toThrow(BadRequestException);
    });

    it('records a FAILED row and rethrows when parsing throws', async () => {
      parser.parse.mockImplementation(() => {
        throw new Error('no extractable text');
      });

      await expect(service.upload(owner, owner.id, file)).rejects.toThrow(BadRequestException);
      expect(repository.create).toHaveBeenCalledWith(
        owner.id,
        expect.objectContaining({ status: 'FAILED' }),
      );
    });
  });

  describe('confirm', () => {
    it('creates Profile, MasterResume, and section rows from the extracted data', async () => {
      const result = await service.confirm(owner, owner.id, cvImportRow.id, {});

      expect(profileService.upsertForUser).toHaveBeenCalled();
      expect(masterResumeService.createForUser).toHaveBeenCalledWith(
        owner,
        owner.id,
        expect.objectContaining({ summary: parsedData.summary }),
      );
      expect(sectionsService.create).toHaveBeenCalledWith(
        'education',
        owner,
        owner.id,
        expect.any(Object),
      );
      expect(sectionsService.create).toHaveBeenCalledWith('skills', owner, owner.id, {
        name: 'TypeScript',
      });
      expect(repository.update).toHaveBeenCalledWith(cvImportRow.id, {
        status: 'CONFIRMED',
        masterResumeId: 'mr-1',
      });
      expect(result.masterResume).toEqual({ id: 'mr-1' });
    });

    it('skips a work experience entry missing a start date and reports it', async () => {
      const result = await service.confirm(owner, owner.id, cvImportRow.id, {});
      expect(result.skippedEntries.some((s) => s.includes('missing start date'))).toBe(true);
      // Only the one valid entry (with startDate) should have been created.
      const workExperienceCalls = sectionsService.create.mock.calls.filter(
        (c) => c[0] === 'work-experience',
      );
      expect(workExperienceCalls).toHaveLength(1);
    });

    it('rejects confirming a CV import that is not in EXTRACTED status', async () => {
      repository.findById.mockResolvedValue({ ...cvImportRow, status: 'CONFIRMED' } as never);
      await expect(service.confirm(owner, owner.id, cvImportRow.id, {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException for an import owned by someone else', async () => {
      repository.findById.mockResolvedValue({ ...cvImportRow, userId: 'someone-else' } as never);
      await expect(service.confirm(owner, owner.id, cvImportRow.id, {})).rejects.toThrow(
        NotFoundException,
      );
    });

    it('updates the existing Master Resume instead of creating a second one when one already exists', async () => {
      masterResumeService.getForUser.mockResolvedValue({ id: 'mr-existing' } as never);
      masterResumeService.updateForUser.mockResolvedValue({ id: 'mr-existing' } as never);

      const result = await service.confirm(owner, owner.id, cvImportRow.id, {});

      expect(masterResumeService.createForUser).not.toHaveBeenCalled();
      expect(masterResumeService.updateForUser).toHaveBeenCalledWith(
        owner,
        owner.id,
        expect.objectContaining({ summary: parsedData.summary }),
      );
      expect(result.masterResume).toEqual({ id: 'mr-existing' });
    });

    it('skips a duplicate section entry instead of aborting the whole confirm', async () => {
      sectionsService.create.mockImplementation((sectionType) => {
        if (sectionType === 'skills') {
          throw new ConflictException('This skill already exists on this resume.');
        }
        return Promise.resolve({} as never);
      });

      const result = await service.confirm(owner, owner.id, cvImportRow.id, {});

      expect(
        result.skippedEntries.some(
          (s) => s.includes('Skill "TypeScript"') && s.includes('already exists'),
        ),
      ).toBe(true);
      // Every other section still got created — the duplicate skill didn't abort the rest.
      expect(sectionsService.create).toHaveBeenCalledWith(
        'education',
        owner,
        owner.id,
        expect.any(Object),
      );
      expect(repository.update).toHaveBeenCalledWith(
        cvImportRow.id,
        expect.objectContaining({ status: 'CONFIRMED' }),
      );
    });

    it('lets a non-duplicate error from sectionsService.create propagate (not swallowed as a skip)', async () => {
      sectionsService.create.mockImplementation((sectionType) => {
        if (sectionType === 'skills') {
          throw new Error('unexpected database error');
        }
        return Promise.resolve({} as never);
      });

      await expect(service.confirm(owner, owner.id, cvImportRow.id, {})).rejects.toThrow(
        'unexpected database error',
      );
    });

    it('creates the Phase 12 canonical-model sections: awards, volunteer experience, references', async () => {
      await service.confirm(owner, owner.id, cvImportRow.id, {});

      expect(sectionsService.create).toHaveBeenCalledWith(
        'awards',
        owner,
        owner.id,
        expect.objectContaining({ title: 'Employee of the Year', issuer: 'Acme' }),
      );
      expect(sectionsService.create).toHaveBeenCalledWith(
        'volunteer-experience',
        owner,
        owner.id,
        expect.objectContaining({ organization: 'Red Cross', role: 'Volunteer' }),
      );
      expect(sectionsService.create).toHaveBeenCalledWith(
        'references',
        owner,
        owner.id,
        expect.objectContaining({ name: 'João Silva', email: 'joao@example.com' }),
      );
    });

    it('skips a reference missing a name and an award missing a title, without aborting the rest', async () => {
      const noName = {
        ...parsedData,
        awards: [{ issuer: 'Acme' }],
        references: [{ email: 'x@example.com' }],
      };
      parser.parse.mockReturnValue({ data: noName, confidence: {}, rawText: 'raw text' } as never);
      repository.findById.mockResolvedValue({ ...cvImportRow, extractedData: noName } as never);

      const result = await service.confirm(owner, owner.id, cvImportRow.id, {});

      expect(
        result.skippedEntries.some((s) => s.includes('Award') && s.includes('missing title')),
      ).toBe(true);
      expect(
        result.skippedEntries.some((s) => s.includes('Reference') && s.includes('missing name')),
      ).toBe(true);
    });

    describe('strategy (brief §13/§35 — Master Resume already exists)', () => {
      beforeEach(() => {
        masterResumeService.getForUser.mockResolvedValue({ id: 'mr-existing' } as never);
        masterResumeService.updateForUser.mockResolvedValue({ id: 'mr-existing' } as never);
        sectionsService.list.mockResolvedValue([{ id: 'existing-skill-1' } as never]);
      });

      it('defaults to "merge" (no strategy field sent) and never wipes existing sections', async () => {
        await service.confirm(owner, owner.id, cvImportRow.id, {});
        expect(sectionsService.remove).not.toHaveBeenCalled();
      });

      it('"merge" explicitly sent behaves identically to the default — no wipe', async () => {
        await service.confirm(owner, owner.id, cvImportRow.id, { strategy: 'merge' });
        expect(sectionsService.remove).not.toHaveBeenCalled();
      });

      it('"replace" soft-deletes every existing active section row before importing the new ones', async () => {
        await service.confirm(owner, owner.id, cvImportRow.id, { strategy: 'replace' });
        expect(sectionsService.remove).toHaveBeenCalledWith(
          'work-experience',
          owner,
          owner.id,
          'existing-skill-1',
        );
        expect(sectionsService.remove).toHaveBeenCalledWith(
          'skills',
          owner,
          owner.id,
          'existing-skill-1',
        );
        // Only ever runs against an EXISTING Master Resume — a first-time
        // import (no Master Resume yet) has nothing to wipe.
      });

      it('never wipes anything when strategy is "replace" but there is no existing Master Resume yet', async () => {
        masterResumeService.getForUser.mockResolvedValue(null);
        masterResumeService.createForUser.mockResolvedValue({ id: 'mr-new' } as never);

        await service.confirm(owner, owner.id, cvImportRow.id, { strategy: 'replace' });

        expect(sectionsService.remove).not.toHaveBeenCalled();
      });

      it('emits a "merged" event in addition to "confirmed" for strategy=merge against an existing resume', async () => {
        await service.confirm(owner, owner.id, cvImportRow.id, {});
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ action: 'merged' }),
        );
      });

      it('emits a "replaced" event in addition to "confirmed" for strategy=replace', async () => {
        await service.confirm(owner, owner.id, cvImportRow.id, { strategy: 'replace' });
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({ action: 'replaced' }),
        );
      });
    });

    describe('mergeDecision (FASE 7 audit — "Existente vs Importado" per-entry resolution)', () => {
      it('does not create anything for an entry resolved as "keep_existing", and reports it', async () => {
        const data = {
          ...parsedData,
          skills: [
            {
              name: 'TypeScript',
              mergeDecision: 'keep_existing' as const,
              existingSectionId: 'skill-1',
            },
          ],
        };
        repository.findById.mockResolvedValue({ ...cvImportRow, extractedData: data } as never);

        const result = await service.confirm(owner, owner.id, cvImportRow.id, {});

        expect(sectionsService.create).not.toHaveBeenCalledWith(
          'skills',
          owner,
          owner.id,
          expect.anything(),
        );
        expect(sectionsService.update).not.toHaveBeenCalledWith(
          'skills',
          owner,
          owner.id,
          'skill-1',
          expect.anything(),
        );
        expect(result.keptExistingEntries.some((s) => s.includes('TypeScript'))).toBe(true);
      });

      it('updates the existing row instead of creating a new one for "use_imported"', async () => {
        const data = {
          ...parsedData,
          workExperiences: [
            {
              company: 'Acme Corp',
              position: 'Gestora de Projeto',
              startDate: '2020-01-01',
              mergeDecision: 'use_imported' as const,
              existingSectionId: 'wx-existing-1',
            },
          ],
        };
        repository.findById.mockResolvedValue({ ...cvImportRow, extractedData: data } as never);

        const result = await service.confirm(owner, owner.id, cvImportRow.id, {});

        expect(sectionsService.update).toHaveBeenCalledWith(
          'work-experience',
          owner,
          owner.id,
          'wx-existing-1',
          expect.objectContaining({ company: 'Acme Corp', position: 'Gestora de Projeto' }),
        );
        expect(sectionsService.create).not.toHaveBeenCalledWith(
          'work-experience',
          owner,
          owner.id,
          expect.anything(),
        );
        expect(result.updatedEntries.some((s) => s.includes('Gestora de Projeto'))).toBe(true);
      });

      it('never includes an undefined field in the update payload — a non-destructive partial update, not a full overwrite', async () => {
        const data = {
          ...parsedData,
          workExperiences: [
            {
              company: 'Acme Corp',
              position: 'Gestora de Projeto',
              // location deliberately absent — must NOT be sent as
              // `location: undefined` (which Prisma would still accept, but
              // this asserts the payload was actually filtered, not just
              // "happens to work").
              startDate: '2020-01-01',
              mergeDecision: 'merge' as const,
              existingSectionId: 'wx-existing-1',
            },
          ],
        };
        repository.findById.mockResolvedValue({ ...cvImportRow, extractedData: data } as never);

        await service.confirm(owner, owner.id, cvImportRow.id, {});

        const [, , , , payload] = sectionsService.update.mock.calls.find(
          (c) => c[0] === 'work-experience',
        )!;
        expect(Object.keys(payload as object)).not.toContain('location');
      });

      it('"merge" uses the same non-destructive update mechanism as "use_imported"', async () => {
        const data = {
          ...parsedData,
          skills: [{ name: 'Rust', mergeDecision: 'merge' as const, existingSectionId: 'skill-2' }],
        };
        repository.findById.mockResolvedValue({ ...cvImportRow, extractedData: data } as never);

        const result = await service.confirm(owner, owner.id, cvImportRow.id, {});

        expect(sectionsService.update).toHaveBeenCalledWith('skills', owner, owner.id, 'skill-2', {
          name: 'Rust',
        });
        expect(result.updatedEntries.some((s) => s.includes('Rust'))).toBe(true);
      });

      it('skips gracefully (does not abort confirm) when the referenced existing entry is no longer found', async () => {
        sectionsService.update.mockImplementation((sectionType) => {
          if (sectionType === 'skills') {
            throw new NotFoundException('Section item not found.');
          }
          return Promise.resolve({} as never);
        });
        const data = {
          ...parsedData,
          skills: [
            {
              name: 'TypeScript',
              mergeDecision: 'use_imported' as const,
              existingSectionId: 'stale-id',
            },
          ],
        };
        repository.findById.mockResolvedValue({ ...cvImportRow, extractedData: data } as never);

        const result = await service.confirm(owner, owner.id, cvImportRow.id, {});

        expect(
          result.skippedEntries.some(
            (s) => s.includes('TypeScript') && s.includes('no longer found'),
          ),
        ).toBe(true);
        // The rest of confirm() still completed — status still moves to CONFIRMED.
        expect(repository.update).toHaveBeenCalledWith(
          cvImportRow.id,
          expect.objectContaining({ status: 'CONFIRMED' }),
        );
      });

      it('an entry with no mergeDecision behaves exactly as before (creates a new row)', async () => {
        const result = await service.confirm(owner, owner.id, cvImportRow.id, {});
        expect(sectionsService.update).not.toHaveBeenCalled();
        expect(result.keptExistingEntries).toEqual([]);
        expect(result.updatedEntries).toEqual([]);
      });
    });
  });

  describe('previewMerge', () => {
    it('returns everything as "new" when the user has no Master Resume yet', async () => {
      masterResumeService.getForUser.mockResolvedValue(null);

      const preview = await service.previewMerge(owner, owner.id, cvImportRow.id);

      expect(preview.newCount).toBeGreaterThan(0);
      expect(preview.duplicateCount).toBe(0);
      expect(sectionsService.list).not.toHaveBeenCalled();
    });

    it('classifies an entry matching an existing section row as a possible duplicate', async () => {
      masterResumeService.getForUser.mockResolvedValue({ id: 'mr-existing' } as never);
      sectionsService.list.mockImplementation((sectionType) => {
        if (sectionType === 'skills') return Promise.resolve([{ name: 'TypeScript' } as never]);
        return Promise.resolve([]);
      });

      const preview = await service.previewMerge(owner, owner.id, cvImportRow.id);

      expect(preview.skills).toEqual([
        {
          entry: { name: 'TypeScript' },
          status: 'possible_duplicate',
          existingId: undefined,
          existing: { name: 'TypeScript' },
        },
      ]);
      expect(preview.duplicateCount).toBeGreaterThanOrEqual(1);
    });

    it('never mutates anything — read-only', async () => {
      masterResumeService.getForUser.mockResolvedValue({ id: 'mr-existing' } as never);
      await service.previewMerge(owner, owner.id, cvImportRow.id);

      expect(sectionsService.create).not.toHaveBeenCalled();
      expect(sectionsService.remove).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('discard', () => {
    it('marks the import as DISCARDED', async () => {
      await service.discard(owner, owner.id, cvImportRow.id);
      expect(repository.update).toHaveBeenCalledWith(cvImportRow.id, { status: 'DISCARDED' });
    });

    it('refuses to discard an already-confirmed import', async () => {
      repository.findById.mockResolvedValue({ ...cvImportRow, status: 'CONFIRMED' } as never);
      await expect(service.discard(owner, owner.id, cvImportRow.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes and emits a history event', async () => {
      await service.remove(owner, owner.id, cvImportRow.id);
      expect(repository.softDelete).toHaveBeenCalledWith(cvImportRow.id);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ action: 'deleted', entityType: 'cv_import' }),
      );
    });
  });

  describe('enhanceWithAi (FASE 22 — CV Import AI)', () => {
    it('executes via AiOrchestrationService with the CV_IMPORT feature and a fresh idempotency key', async () => {
      await service.enhanceWithAi(owner, owner.id, cvImportRow.id);

      expect(aiOrchestrationService.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: owner.id,
          feature: AIFeature.CV_IMPORT,
          idempotencyKey: expect.stringContaining(`cv-import-ai:${owner.id}:`),
        }),
      );
    });

    it('persists validated suggestions, unresolvedFields, aiRequestId, and creditsUsed onto the SAME CvImport row', async () => {
      const result = await service.enhanceWithAi(owner, owner.id, cvImportRow.id);

      expect(repository.update).toHaveBeenCalledWith(cvImportRow.id, {
        aiSuggestions: [
          expect.objectContaining({
            section: 'workExperiences',
            index: 0,
            field: 'position',
            originalValue: 'Engineer',
            suggestedValue: 'Software Engineer',
          }),
        ],
        aiUnresolvedFields: [],
        aiRequestId: 'ai-req-1',
        creditsUsed: 30,
      });
      expect(result.aiSuggestions).toBeDefined();
    });

    it('never calls CreditService/credit logic directly — only AiOrchestrationService.execute()', () => {
      // Structural check: the service has no CreditService dependency at
      // all (see constructor) — this test documents that intent explicitly,
      // matching every other AI feature's own equivalent test.
      expect(service).not.toHaveProperty('creditService');
    });

    it('rejects when the import is not in EXTRACTED status', async () => {
      repository.findById.mockResolvedValue({ ...cvImportRow, status: 'CONFIRMED' } as never);
      await expect(service.enhanceWithAi(owner, owner.id, cvImportRow.id)).rejects.toThrow(
        ConflictException,
      );
      expect(aiOrchestrationService.execute).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for an import owned by someone else', async () => {
      repository.findById.mockResolvedValue({ ...cvImportRow, userId: 'someone-else' } as never);
      await expect(service.enhanceWithAi(owner, owner.id, cvImportRow.id)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects a stranger acting on another user', async () => {
      await expect(service.enhanceWithAi(stranger, owner.id, cvImportRow.id)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('drops a suggestion referencing a field that does not exist in the real draft, keeping only the genuinely valid one', async () => {
      aiOrchestrationService.execute.mockResolvedValue({
        text: JSON.stringify({
          fieldSuggestions: [
            {
              section: 'workExperiences',
              index: 0,
              field: 'position',
              originalValue: 'Engineer',
              suggestedValue: 'Software Engineer',
              reason: 'real, valid suggestion',
              confidence: 0.8,
            },
            {
              section: 'workExperiences',
              index: 5, // out of range — parsedData only has 2 entries
              field: 'position',
              originalValue: 'Engineer',
              suggestedValue: 'Fabricated Title',
              reason: 'hallucinated',
              confidence: 0.9,
            },
          ],
          unresolvedFields: [],
        }),
        creditsCharged: 30,
        aiRequestId: 'ai-req-2',
      } as never);

      const result = await service.enhanceWithAi(owner, owner.id, cvImportRow.id);
      expect(result.aiSuggestions).toHaveLength(1);
      expect((result.aiSuggestions as unknown[])[0]).toMatchObject({ index: 0 });
    });

    it('throws InvalidPromptError (triggering the same automatic refund as any other pipeline failure) when every suggestion references a non-existent field', async () => {
      aiOrchestrationService.execute.mockImplementation((async (request: {
        options?: { responseValidator?: (r: { text: string }) => void };
      }) => {
        const badText = JSON.stringify({
          fieldSuggestions: [
            {
              section: 'workExperiences',
              index: 5,
              field: 'position',
              originalValue: 'Engineer',
              suggestedValue: 'Fabricated Title',
              reason: 'hallucinated',
              confidence: 0.9,
            },
          ],
          unresolvedFields: [],
        });
        request.options?.responseValidator?.({ text: badText });
        return { text: badText, creditsCharged: 30, aiRequestId: 'ai-req-2b' };
      }) as never);

      await expect(service.enhanceWithAi(owner, owner.id, cvImportRow.id)).rejects.toThrow();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('always substitutes the REAL current value as originalValue, never trusting the AI response echo', async () => {
      aiOrchestrationService.execute.mockResolvedValue({
        text: JSON.stringify({
          fieldSuggestions: [
            {
              section: 'workExperiences',
              index: 0,
              field: 'position',
              originalValue: 'something the AI misremembered',
              suggestedValue: 'Software Engineer',
              reason: 'clean up',
              confidence: 0.7,
            },
          ],
          unresolvedFields: [],
        }),
        creditsCharged: 30,
        aiRequestId: 'ai-req-3',
      } as never);

      const result = await service.enhanceWithAi(owner, owner.id, cvImportRow.id);
      expect((result.aiSuggestions as unknown[])[0]).toMatchObject({
        originalValue: 'Engineer',
      });
    });

    it('propagates the error and persists nothing when AiOrchestrationService throws (refund already handled inside the pipeline)', async () => {
      aiOrchestrationService.execute.mockRejectedValue(new Error('insufficient credits'));
      await expect(service.enhanceWithAi(owner, owner.id, cvImportRow.id)).rejects.toThrow(
        'insufficient credits',
      );
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('the responseValidator passed to AiOrchestrationService throws InvalidPromptError when every suggestion is invalid', async () => {
      aiOrchestrationService.execute.mockImplementation((async (request: {
        options?: { responseValidator?: (r: { text: string }) => void };
      }) => {
        const badText = JSON.stringify({
          fieldSuggestions: [
            {
              section: 'skills',
              index: 99,
              field: 'name',
              originalValue: '',
              suggestedValue: 'x',
              reason: 'r',
              confidence: 0.5,
            },
          ],
          unresolvedFields: [],
        });
        request.options?.responseValidator?.({ text: badText });
        return { text: badText, creditsCharged: 30, aiRequestId: 'ai-req-4' };
      }) as never);

      await expect(service.enhanceWithAi(owner, owner.id, cvImportRow.id)).rejects.toThrow();
    });
  });
});
