import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ResumeVariantService } from './resume-variant.service';
import type { ResumeVariantRepository } from './resume-variant.repository';
import type { MasterResumeRepository } from '../master-resume/master-resume.repository';
import type { ResumeSectionsRepository } from '../resume-sections/resume-sections.repository';
import type { JobTargetService } from '../job-target/job-target.service';
import type { ResumeVersionRepository } from '../resume-version/resume-version.repository';
import type { ResumeTemplateRepository } from '../template-engine/resume-template.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('ResumeVariantService', () => {
  let variantRepository: jest.Mocked<ResumeVariantRepository>;
  let masterResumeRepository: jest.Mocked<MasterResumeRepository>;
  let sectionsRepository: jest.Mocked<ResumeSectionsRepository>;
  let jobTargetService: jest.Mocked<JobTargetService>;
  let versionRepository: jest.Mocked<ResumeVersionRepository>;
  let templateRepository: jest.Mocked<ResumeTemplateRepository>;
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
      // Default resolved value gives recordVersion() a `.version` to read;
      // individual tests override this when they care about the exact shape.
      applyEdit: jest.fn().mockResolvedValue({ id: 'rv-1', version: 2 }),
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
    versionRepository = {
      create: jest.fn().mockResolvedValue({ id: 'version-1' }),
      findAllByVariantId: jest.fn(),
      findOneByVariantAndNumber: jest.fn(),
      findLatestByVariantId: jest.fn(),
      findOneByVariantAndNumberUnfiltered: jest.fn(),
    } as unknown as jest.Mocked<ResumeVersionRepository>;
    eventEmitter = { emit: jest.fn() };
    templateRepository = {
      findById: jest.fn(),
      findAll: jest.fn(),
      findByIdUnfiltered: jest.fn(),
      findRecentlyUsedByUserId: jest.fn(),
    } as unknown as jest.Mocked<ResumeTemplateRepository>;
    service = new ResumeVariantService(
      variantRepository,
      masterResumeRepository,
      sectionsRepository,
      jobTargetService,
      versionRepository,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventEmitter as any,
      templateRepository,
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

    it('records the INITIAL version at versionNumber 1 WITHOUT bumping the freshly-created row — applyEdit() must never run on create()', async () => {
      masterResumeRepository.findByUserId.mockResolvedValue({ id: 'mr-1' } as never);
      // The row variantRepository.create() returns already carries the
      // schema's version:1 default — recordInitialVersion() must use this
      // number as-is, not applyEdit()'s (would-be) incremented one.
      variantRepository.create.mockResolvedValue({
        id: 'rv-1',
        version: 1,
        content: { summary: 'x' },
      } as never);

      const result = await service.create(owner, 'user-1', { title: 'Variant' } as never);

      expect(variantRepository.applyEdit).not.toHaveBeenCalled();
      const [data] = versionRepository.create.mock.calls[0]!;
      expect(data.label).toBe('INITIAL');
      expect(data.versionNumber).toBe(1);
      expect(result.version).toBe(1); // the returned object matches what was actually persisted
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

    it('leaves completionPercentage unchanged when neither title nor content is in the DTO, and does not bump the version', async () => {
      variantRepository.findById.mockResolvedValue({
        id: 'rv-1',
        userId: 'user-1',
        title: 'Title',
        content: {},
        completionPercentage: 42,
      } as never);
      variantRepository.update.mockResolvedValue({ id: 'rv-1' } as never);

      await service.update(owner, 'user-1', 'rv-1', { status: 'READY' } as never);

      // Metadata-only edit — no content change, so no version snapshot;
      // plain update(), never applyEdit() (rule 1's version-bump only
      // applies to content-changing edits — see recordVersion's comment).
      expect(variantRepository.applyEdit).not.toHaveBeenCalled();
      const [, data] = variantRepository.update.mock.calls[0]!;
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
      variantRepository.create.mockResolvedValue({
        id: 'rv-2',
        version: 1,
        content: { summary: 'x' },
      } as never);

      const result = await service.duplicate(owner, 'user-1', 'rv-1', {} as never);

      const call = variantRepository.create.mock.calls[0];
      const [, masterResumeId, data] = call!;
      expect(masterResumeId).toBe('mr-1');
      expect(data.title).toBe('Original (copy)');
      expect(data.status).toBe('DRAFT');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'created' }),
      );

      // Same fix as create() — the duplicate's own fresh row already starts
      // at version 1; recording its INITIAL version must not bump it.
      expect(variantRepository.applyEdit).not.toHaveBeenCalled();
      const [versionData] = versionRepository.create.mock.calls[0]!;
      expect(versionData.versionNumber).toBe(1);
      expect(result.version).toBe(1);
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

  describe('setTemplate', () => {
    const existingVariant = { id: 'rv-1', userId: 'user-1' } as never;

    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.setTemplate(stranger, 'user-1', 'rv-1', 'modern'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(variantRepository.update).not.toHaveBeenCalled();
    });

    it('throws NotFound when the variant does not exist for this owner', async () => {
      variantRepository.findById.mockResolvedValue(null);
      await expect(
        service.setTemplate(owner, 'user-1', 'missing', 'modern'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when the templateId does not exist', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      templateRepository.findById.mockResolvedValue(null);
      await expect(
        service.setTemplate(owner, 'user-1', 'rv-1', 'no-such-template'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(variantRepository.update).not.toHaveBeenCalled();
    });

    it('assigns the template via a plain field update and emits "updated" (no version bump)', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      templateRepository.findById.mockResolvedValue({ id: 'modern' } as never);
      variantRepository.update.mockResolvedValue({ id: 'rv-1', templateId: 'modern' } as never);

      const result = await service.setTemplate(owner, 'user-1', 'rv-1', 'modern');

      expect(variantRepository.update).toHaveBeenCalledWith('rv-1', { templateId: 'modern' });
      expect(variantRepository.applyEdit).not.toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'resume_variant', action: 'updated' }),
      );
      expect(result.templateId).toBe('modern');
    });
  });

  describe('updateTheme / resetTheme', () => {
    const existingVariant = { id: 'rv-1', userId: 'user-1' } as never;

    it('denies a non-owner, non-admin user on both updateTheme and resetTheme', async () => {
      await expect(
        service.updateTheme(stranger, 'user-1', 'rv-1', { primaryColor: '#000' } as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.resetTheme(stranger, 'user-1', 'rv-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('updateTheme() wholesale-replaces themeOverrides with exactly the given DTO', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      const dto = { primaryColor: '#111111', iconsEnabled: true } as never;

      await service.updateTheme(owner, 'user-1', 'rv-1', dto);

      expect(variantRepository.update).toHaveBeenCalledWith('rv-1', { themeOverrides: dto });
    });

    it('resetTheme() clears themeOverrides back to SQL NULL (Prisma.DbNull)', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);

      await service.resetTheme(owner, 'user-1', 'rv-1');

      const [, data] = variantRepository.update.mock.calls[0]!;
      expect(data.themeOverrides).toBeDefined();
    });

    it('throws NotFound when the variant does not exist for this owner', async () => {
      variantRepository.findById.mockResolvedValue(null);
      await expect(
        service.updateTheme(owner, 'user-1', 'missing', {} as never),
      ).rejects.toBeInstanceOf(NotFoundException);
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

  describe('saveCheckpoint', () => {
    const existingVariant = {
      id: 'rv-1',
      userId: 'user-1',
      jobTargetId: 'jt-1',
      content: { summary: 'current' },
    } as never;

    it('denies a non-owner, non-admin user', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      await expect(
        service.saveCheckpoint(stranger, 'user-1', 'rv-1', {} as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(versionRepository.create).not.toHaveBeenCalled();
    });

    it('throws NotFound when the variant does not exist for this owner', async () => {
      variantRepository.findById.mockResolvedValue(null);
      await expect(
        service.saveCheckpoint(owner, 'user-1', 'missing', {} as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('snapshots the CURRENT content unchanged under CUSTOM by default, and returns the version row', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.create.mockResolvedValue({ id: 'version-9', versionNumber: 2 } as never);

      const result = await service.saveCheckpoint(owner, 'user-1', 'rv-1', {});

      expect(variantRepository.applyEdit).toHaveBeenCalledWith('rv-1', {
        content: { summary: 'current' },
      });
      const [data] = versionRepository.create.mock.calls[0]!;
      expect(data.label).toBe('CUSTOM');
      expect(data.source).toBe('USER');
      expect(data.content).toEqual({ summary: 'current' });
      expect(result).toEqual({ id: 'version-9', versionNumber: 2 });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ entityType: 'resume_variant', action: 'updated' }),
      );
    });

    it('honors an explicit label, customLabel, and notes', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);

      await service.saveCheckpoint(owner, 'user-1', 'rv-1', {
        label: 'INTERVIEW_VERSION',
        customLabel: 'Before the onsite',
        notes: 'Trimmed the older roles.',
      } as never);

      const [data] = versionRepository.create.mock.calls[0]!;
      expect(data.label).toBe('INTERVIEW_VERSION');
      expect(data.customLabel).toBe('Before the onsite');
      expect(data.notes).toBe('Trimmed the older roles.');
    });

    it('propagates a repository failure rather than swallowing it (manual checkpoint is user-initiated, not a background hook)', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.create.mockRejectedValue(new Error('db unavailable'));

      await expect(service.saveCheckpoint(owner, 'user-1', 'rv-1', {})).rejects.toThrow(
        'db unavailable',
      );
    });

    it('uses the DB-atomic version number from applyEdit() rather than computing it locally', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      variantRepository.applyEdit.mockResolvedValue({ id: 'rv-1', version: 7 } as never);

      await service.saveCheckpoint(owner, 'user-1', 'rv-1', {});

      const [data] = versionRepository.create.mock.calls[0]!;
      expect(data.versionNumber).toBe(7);
    });
  });

  describe('restoreVersion', () => {
    const existingVariant = {
      id: 'rv-1',
      userId: 'user-1',
      title: 'My Variant',
      jobTargetId: 'jt-1',
      content: { summary: 'current' },
    } as never;
    const historicalVersion = {
      id: 'version-1',
      versionNumber: 1,
      content: { summary: 'v1 content' },
    } as never;

    it('denies a non-owner, non-admin user', async () => {
      await expect(service.restoreVersion(stranger, 'user-1', 'rv-1', 1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(variantRepository.findById).not.toHaveBeenCalled();
    });

    it('throws NotFound when the variant does not exist for this owner', async () => {
      variantRepository.findById.mockResolvedValue(null);
      await expect(service.restoreVersion(owner, 'user-1', 'missing', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFound when the requested version number does not exist for this variant/owner', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.findOneByVariantAndNumber.mockResolvedValue(null);

      await expect(service.restoreVersion(owner, 'user-1', 'rv-1', 99)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('copies the historical version content onto the live variant in a single applyEdit() call, and records a new CUSTOM version', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.findOneByVariantAndNumber.mockResolvedValue(historicalVersion);
      variantRepository.applyEdit.mockResolvedValue({
        id: 'rv-1',
        version: 3,
        content: { summary: 'v1 content' },
      } as never);

      const result = await service.restoreVersion(owner, 'user-1', 'rv-1', 1);

      // applyEdit() must run exactly once — see resume-variant.service.ts's
      // recordVersion() comment on why a second call would double-bump
      // ResumeVariant.version relative to the ResumeVariantVersion row count.
      expect(variantRepository.applyEdit).toHaveBeenCalledTimes(1);
      const [, editData] = variantRepository.applyEdit.mock.calls[0]!;
      expect(editData.content).toEqual({ summary: 'v1 content' });

      const [versionData] = versionRepository.create.mock.calls[0]!;
      expect(versionData.label).toBe('CUSTOM');
      expect(versionData.customLabel).toBe('Restored from version 1');
      expect(versionData.versionNumber).toBe(3);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'updated' }),
      );
      expect(result.content).toEqual({ summary: 'v1 content' });
    });

    it('restoring version 1 (the first version) works the same as any other version', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.findOneByVariantAndNumber.mockResolvedValue({
        id: 'version-1',
        versionNumber: 1,
        content: { summary: 'original' },
      } as never);

      await service.restoreVersion(owner, 'user-1', 'rv-1', 1);

      expect(versionRepository.findOneByVariantAndNumber).toHaveBeenCalledWith('rv-1', 1, 'user-1');
      const [, editData] = variantRepository.applyEdit.mock.calls[0]!;
      expect(editData.content).toEqual({ summary: 'original' });
    });

    it('restoring the latest version (a no-op in content terms) still creates a fresh version row', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.findOneByVariantAndNumber.mockResolvedValue({
        id: 'version-5',
        versionNumber: 5,
        content: { summary: 'current' },
      } as never);

      await service.restoreVersion(owner, 'user-1', 'rv-1', 5);

      expect(versionRepository.create).toHaveBeenCalledTimes(1);
      const [versionData] = versionRepository.create.mock.calls[0]!;
      expect(versionData.customLabel).toBe('Restored from version 5');
    });
  });

  describe('duplicateFromVersion', () => {
    const sourceVariant = {
      id: 'rv-1',
      userId: 'user-1',
      masterResumeId: 'mr-1',
      title: 'Original',
      jobTargetId: 'jt-1',
    } as never;
    const historicalVersion = {
      id: 'version-2',
      versionNumber: 2,
      content: { summary: 'v2 content' },
    } as never;

    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.duplicateFromVersion(stranger, 'user-1', 'rv-1', 2, {} as never),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound when the source variant does not exist for this owner', async () => {
      variantRepository.findById.mockResolvedValue(null);
      await expect(
        service.duplicateFromVersion(owner, 'user-1', 'missing', 2, {} as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound when the requested version does not exist', async () => {
      variantRepository.findById.mockResolvedValue(sourceVariant);
      versionRepository.findOneByVariantAndNumber.mockResolvedValue(null);

      await expect(
        service.duplicateFromVersion(owner, 'user-1', 'rv-1', 99, {} as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('creates a brand new independent variant from the historical version content, defaulting the title to "<source title> (vN copy)"', async () => {
      variantRepository.findById.mockResolvedValue(sourceVariant);
      versionRepository.findOneByVariantAndNumber.mockResolvedValue(historicalVersion);
      variantRepository.create.mockResolvedValue({
        id: 'rv-new',
        version: 1,
        content: { summary: 'v2 content' },
      } as never);

      const result = await service.duplicateFromVersion(owner, 'user-1', 'rv-1', 2, {} as never);

      const [userId, masterResumeId, data] = variantRepository.create.mock.calls[0]!;
      expect(userId).toBe('user-1');
      expect(masterResumeId).toBe('mr-1');
      expect(data.title).toBe('Original (v2 copy)');
      expect(data.status).toBe('DRAFT');
      expect(data.content).toEqual({ summary: 'v2 content' });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'created' }),
      );

      // Same fix as create()/duplicate() — the new row already starts at
      // version 1; recording its INITIAL version must not bump it.
      expect(variantRepository.applyEdit).not.toHaveBeenCalled();
      const [versionData] = versionRepository.create.mock.calls[0]!;
      expect(versionData.versionNumber).toBe(1);
      expect(result.version).toBe(1);
    });

    it('uses a custom title override when given', async () => {
      variantRepository.findById.mockResolvedValue(sourceVariant);
      versionRepository.findOneByVariantAndNumber.mockResolvedValue(historicalVersion);
      variantRepository.create.mockResolvedValue({ id: 'rv-new' } as never);

      await service.duplicateFromVersion(owner, 'user-1', 'rv-1', 2, {
        title: 'My custom copy',
      } as never);

      const [, , data] = variantRepository.create.mock.calls[0]!;
      expect(data.title).toBe('My custom copy');
    });

    it('is independent from the source — a second duplicate from the same version creates a separate row each time', async () => {
      variantRepository.findById.mockResolvedValue(sourceVariant);
      versionRepository.findOneByVariantAndNumber.mockResolvedValue(historicalVersion);
      variantRepository.create
        .mockResolvedValueOnce({ id: 'rv-copy-1' } as never)
        .mockResolvedValueOnce({ id: 'rv-copy-2' } as never);

      const first = await service.duplicateFromVersion(owner, 'user-1', 'rv-1', 2, {} as never);
      const second = await service.duplicateFromVersion(owner, 'user-1', 'rv-1', 2, {} as never);

      expect(first.id).not.toBe(second.id);
      expect(variantRepository.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('snapshotBeforeAiAction', () => {
    const existingVariant = {
      id: 'rv-1',
      userId: 'user-1',
      jobTargetId: 'jt-1',
      content: { summary: 'current' },
    } as never;

    it('records an AI-sourced version with the given label and summary', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);

      await service.snapshotBeforeAiAction(owner, 'user-1', 'rv-1', {
        label: 'AI_OPTIMIZED',
        changeSummary: 'Before running ATS analysis',
      });

      const [data] = versionRepository.create.mock.calls[0]!;
      expect(data.label).toBe('AI_OPTIMIZED');
      expect(data.source).toBe('AI');
      expect(data.changeSummary).toBe('Before running ATS analysis');
    });

    it("never throws — a permission failure is caught and logged, not propagated (a missed audit snapshot must never block the caller's real action)", async () => {
      await expect(
        service.snapshotBeforeAiAction(stranger, 'user-1', 'rv-1', {
          label: 'AI_OPTIMIZED',
          changeSummary: 'x',
        }),
      ).resolves.toBeUndefined();
      expect(versionRepository.create).not.toHaveBeenCalled();
    });

    it('never throws when the variant does not exist', async () => {
      variantRepository.findById.mockResolvedValue(null);
      await expect(
        service.snapshotBeforeAiAction(owner, 'user-1', 'missing', {
          label: 'AI_OPTIMIZED',
          changeSummary: 'x',
        }),
      ).resolves.toBeUndefined();
    });

    it('never throws when the version repository itself fails', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.create.mockRejectedValue(new Error('db unavailable'));

      await expect(
        service.snapshotBeforeAiAction(owner, 'user-1', 'rv-1', {
          label: 'AI_OPTIMIZED',
          changeSummary: 'x',
        }),
      ).resolves.toBeUndefined();
    });

    it('passes through an explicit jobTargetId/coverLetterId override instead of the variant default', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);

      await service.snapshotBeforeAiAction(owner, 'user-1', 'rv-1', {
        label: 'AI_OPTIMIZED',
        changeSummary: 'x',
        jobTargetId: 'jt-override',
        coverLetterId: 'cl-1',
      });

      const [data] = versionRepository.create.mock.calls[0]!;
      expect(data.jobTargetId).toBe('jt-override');
      expect(data.coverLetterId).toBe('cl-1');
    });
  });

  describe('recordAppliedContentVersion', () => {
    const variant = { id: 'rv-1', userId: 'user-1', jobTargetId: 'jt-1', version: 4 } as never;

    it("snapshots the already-persisted content it is given, labeled AI_OPTIMIZED, using the variant's already-bumped version — WITHOUT calling applyEdit() again", async () => {
      await service.recordAppliedContentVersion(
        owner,
        'user-1',
        variant,
        { summary: 'applied' },
        {
          changeSummary: 'Applied 3 optimization suggestions',
        },
      );

      // The caller (e.g. ResumeOptimizationService.apply()) already wrote
      // this content + bumped the version atomically inside its own
      // transaction — a second applyEdit() here would double-bump
      // ResumeVariant.version relative to the single version row created.
      expect(variantRepository.applyEdit).not.toHaveBeenCalled();
      const [data] = versionRepository.create.mock.calls[0]!;
      expect(data.label).toBe('AI_OPTIMIZED');
      expect(data.source).toBe('AI');
      expect(data.content).toEqual({ summary: 'applied' });
      expect(data.changeSummary).toBe('Applied 3 optimization suggestions');
      expect(data.versionNumber).toBe(4);
    });

    it('never throws when the version repository fails — a missed snapshot must not undo an already-applied edit', async () => {
      versionRepository.create.mockRejectedValue(new Error('db unavailable'));

      await expect(
        service.recordAppliedContentVersion(
          owner,
          'user-1',
          variant,
          { summary: 'applied' },
          {
            changeSummary: 'x',
          },
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('snapshotForApplication', () => {
    const existingVariant = {
      id: 'rv-1',
      userId: 'user-1',
      jobTargetId: 'jt-1',
      content: { summary: 'final' },
    } as never;

    it('denies a non-owner, non-admin user', async () => {
      await expect(
        service.snapshotForApplication(stranger, 'user-1', 'rv-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound when the variant does not exist for this owner', async () => {
      variantRepository.findById.mockResolvedValue(null);
      await expect(
        service.snapshotForApplication(owner, 'user-1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('always creates a fresh APPLICATION_VERSION snapshot, guaranteeing an exact-content capture', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.create.mockResolvedValue({
        id: 'version-app-1',
        versionNumber: 4,
      } as never);

      const result = await service.snapshotForApplication(owner, 'user-1', 'rv-1');

      const [data] = versionRepository.create.mock.calls[0]!;
      expect(data.label).toBe('APPLICATION_VERSION');
      expect(data.source).toBe('USER');
      expect(data.content).toEqual({ summary: 'final' });
      expect(result).toEqual({ id: 'version-app-1', versionNumber: 4 });
    });

    it('creates a distinct version row on every call, even back-to-back for the same variant (no de-duplication — every application submission must be independently recoverable)', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.create
        .mockResolvedValueOnce({ id: 'version-app-1' } as never)
        .mockResolvedValueOnce({ id: 'version-app-2' } as never);

      const first = await service.snapshotForApplication(owner, 'user-1', 'rv-1');
      const second = await service.snapshotForApplication(owner, 'user-1', 'rv-1');

      expect(first.id).not.toBe(second.id);
      expect(versionRepository.create).toHaveBeenCalledTimes(2);
    });

    it('propagates a repository failure (application-linkage snapshots must be known-good, never silently missing)', async () => {
      variantRepository.findById.mockResolvedValue(existingVariant);
      versionRepository.create.mockRejectedValue(new Error('db unavailable'));

      await expect(service.snapshotForApplication(owner, 'user-1', 'rv-1')).rejects.toThrow(
        'db unavailable',
      );
    });
  });

  describe('concurrent snapshot protection', () => {
    it('two concurrent checkpoint calls each get their own DB-atomic version number rather than colliding on a locally-computed one', async () => {
      const existingVariant = {
        id: 'rv-1',
        userId: 'user-1',
        jobTargetId: 'jt-1',
        content: { summary: 'current' },
      } as never;
      variantRepository.findById.mockResolvedValue(existingVariant);
      // Simulates two overlapping requests each hitting Prisma's atomic
      // `version: { increment: 1 }` and getting back distinct post-increment
      // values — recordVersion() must trust whatever applyEdit() returns
      // rather than pre-computing "current + 1" itself, which would be
      // vulnerable to a lost-update race under real concurrency.
      variantRepository.applyEdit
        .mockResolvedValueOnce({ id: 'rv-1', version: 5 } as never)
        .mockResolvedValueOnce({ id: 'rv-1', version: 6 } as never);

      await Promise.all([
        service.saveCheckpoint(owner, 'user-1', 'rv-1', {}),
        service.saveCheckpoint(owner, 'user-1', 'rv-1', {}),
      ]);

      const versionNumbers = versionRepository.create.mock.calls.map(
        ([data]) => data.versionNumber,
      );
      expect(versionNumbers.sort()).toEqual([5, 6]);
    });
  });
});
