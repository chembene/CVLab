import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ExportService } from './export.service';
import type { ExportRepository } from './export.repository';
import type { ResumeVariantService } from '../resume-variant/resume-variant.service';
import type { ResumeVersionRepository } from '../resume-version/resume-version.repository';
import type { ProfileService } from '../profile/profile.service';
import type { CreditService } from '../credits/credit.service';
import { InsufficientCreditsException } from '../credits/errors/insufficient-credits.exception';
import type { PdfResumeRenderer } from './renderers/pdf-resume.renderer';
import type { DocxResumeRenderer } from './renderers/docx-resume.renderer';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('ExportService', () => {
  let repository: jest.Mocked<ExportRepository>;
  let resumeVariantService: jest.Mocked<ResumeVariantService>;
  let resumeVersionRepository: jest.Mocked<ResumeVersionRepository>;
  let profileService: jest.Mocked<ProfileService>;
  let creditService: jest.Mocked<CreditService>;
  let pdfRenderer: jest.Mocked<PdfResumeRenderer>;
  let docxRenderer: jest.Mocked<DocxResumeRenderer>;
  let service: ExportService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };

  const variant = {
    id: 'rv-1',
    userId: 'user-1',
    version: 3,
    content: { summary: 'current' },
    templateId: 'ats-classic',
    themeOverrides: null,
  };
  const pendingRecord = { id: 'export-1', userId: 'user-1', status: 'PENDING' };
  const profile = { id: 'profile-1', userId: 'user-1', displayName: 'Ana' };
  const renderResult = {
    buffer: Buffer.from('pdf-bytes'),
    fileName: 'resume.pdf',
    contentType: 'application/pdf',
  };

  beforeEach(() => {
    repository = {
      upsertPending: jest.fn().mockResolvedValue(pendingRecord),
      markSuccess: jest.fn(),
      markFailed: jest.fn(),
    } as unknown as jest.Mocked<ExportRepository>;
    resumeVariantService = {
      getOne: jest.fn().mockResolvedValue(variant),
    } as unknown as jest.Mocked<ResumeVariantService>;
    resumeVersionRepository = {
      findByIdWithinVariant: jest.fn(),
    } as unknown as jest.Mocked<ResumeVersionRepository>;
    profileService = {
      getForUser: jest.fn().mockResolvedValue(profile),
    } as unknown as jest.Mocked<ProfileService>;
    creditService = {
      estimate: jest.fn().mockResolvedValue({
        featureKey: 'export_resume_pdf',
        cost: 10,
        currentBalance: 100,
        sufficientBalance: true,
        balanceAfter: 90,
      }),
      spendAndExecute: jest.fn(
        async (_userId: string, _params: unknown, work: () => Promise<unknown>) => work(),
      ),
    } as unknown as jest.Mocked<CreditService>;
    pdfRenderer = {
      render: jest.fn().mockResolvedValue(renderResult),
    } as unknown as jest.Mocked<PdfResumeRenderer>;
    docxRenderer = {
      render: jest.fn().mockResolvedValue({
        ...renderResult,
        fileName: 'resume.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
    } as unknown as jest.Mocked<DocxResumeRenderer>;

    service = new ExportService(
      repository,
      resumeVariantService,
      resumeVersionRepository,
      profileService,
      creditService,
      pdfRenderer,
      docxRenderer,
    );
  });

  it('denies a non-owner, non-admin user before touching the variant', async () => {
    await expect(
      service.exportResume(stranger, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(resumeVariantService.getOne).not.toHaveBeenCalled();
  });

  it('exports the current variant content when no resumeVariantVersionId is given, using variant.version in the idempotency key', async () => {
    await service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' });

    expect(resumeVersionRepository.findByIdWithinVariant).not.toHaveBeenCalled();
    expect(pdfRenderer.render).toHaveBeenCalledWith({
      content: { summary: 'current' },
      profile,
      templateId: 'ats-classic',
      themeOverrides: null,
    });
    expect(repository.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'export:resume:user-1:rv-1:3:PDF',
        resumeVariantVersionId: undefined,
      }),
    );
  });

  it('exports a specific historical version when resumeVariantVersionId is given, using its own versionNumber', async () => {
    resumeVersionRepository.findByIdWithinVariant.mockResolvedValue({
      id: 'version-2',
      resumeVariantId: 'rv-1',
      versionNumber: 2,
      content: { summary: 'older' },
    } as never);

    await service.exportResume(owner, 'user-1', {
      resumeVariantId: 'rv-1',
      resumeVariantVersionId: 'version-2',
      format: 'PDF',
    });

    expect(resumeVersionRepository.findByIdWithinVariant).toHaveBeenCalledWith(
      'version-2',
      'rv-1',
      'user-1',
    );
    expect(pdfRenderer.render).toHaveBeenCalledWith(
      expect.objectContaining({ content: { summary: 'older' } }),
    );
    expect(repository.upsertPending).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'export:resume:user-1:rv-1:2:PDF',
        resumeVariantVersionId: 'version-2',
      }),
    );
  });

  it('throws NotFound when the given version does not belong to the given variant (or another owner)', async () => {
    resumeVersionRepository.findByIdWithinVariant.mockResolvedValue(null);

    await expect(
      service.exportResume(owner, 'user-1', {
        resumeVariantId: 'rv-1',
        resumeVariantVersionId: 'foreign-version',
        format: 'PDF',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(creditService.estimate).not.toHaveBeenCalled();
  });

  it('routes format PDF to PdfResumeRenderer and format DOCX to DocxResumeRenderer', async () => {
    await service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' });
    expect(pdfRenderer.render).toHaveBeenCalledTimes(1);
    expect(docxRenderer.render).not.toHaveBeenCalled();

    await service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'DOCX' });
    expect(docxRenderer.render).toHaveBeenCalledTimes(1);
  });

  it('estimates credits against the format-specific feature key (export_resume_pdf / export_resume_docx)', async () => {
    await service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' });
    expect(creditService.estimate).toHaveBeenCalledWith('user-1', 'export_resume_pdf');

    await service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'DOCX' });
    expect(creditService.estimate).toHaveBeenCalledWith('user-1', 'export_resume_docx');
  });

  it('throws InsufficientCreditsException and never calls spendAndExecute/render when the balance is too low', async () => {
    creditService.estimate.mockResolvedValue({
      featureKey: 'export_resume_pdf',
      cost: 10,
      currentBalance: 5,
      sufficientBalance: false,
      balanceAfter: -5,
    } as never);

    await expect(
      service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' }),
    ).rejects.toBeInstanceOf(InsufficientCreditsException);
    expect(creditService.spendAndExecute).not.toHaveBeenCalled();
    expect(pdfRenderer.render).not.toHaveBeenCalled();
    // The row upsertPending() already created must not be left dangling at
    // PENDING forever — nothing was charged, so 0/0 charged/refunded.
    expect(repository.markFailed).toHaveBeenCalledWith(
      'export-1',
      0,
      0,
      'Insufficient credits for "export_resume_pdf".',
    );
  });

  it('never uses randomUUID() as the idempotency key — it is deterministic from user/variant/version/format', async () => {
    await service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' });
    const spendArgs = creditService.spendAndExecute.mock.calls[0]!;
    const params = spendArgs[1] as { idempotencyKey: string };
    expect(params.idempotencyKey).toBe('export:resume:user-1:rv-1:3:PDF');

    // Calling again with identical inputs produces the exact same key.
    await service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' });
    const secondParams = creditService.spendAndExecute.mock.calls[1]![1] as {
      idempotencyKey: string;
    };
    expect(secondParams.idempotencyKey).toBe(params.idempotencyKey);
  });

  it('marks the ExportedDocument SUCCESS with the credits actually charged on a successful render', async () => {
    await service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' });
    expect(repository.markSuccess).toHaveBeenCalledWith('export-1', 10);
    expect(repository.markFailed).not.toHaveBeenCalled();
  });

  it('marks the ExportedDocument FAILED with creditsCharged/creditsRefunded and the failure reason, then rethrows, when the renderer throws', async () => {
    const failure = new Error('Chromium crashed.');
    pdfRenderer.render.mockRejectedValue(failure);

    await expect(
      service.exportResume(owner, 'user-1', { resumeVariantId: 'rv-1', format: 'PDF' }),
    ).rejects.toBe(failure);

    expect(repository.markFailed).toHaveBeenCalledWith('export-1', 10, 10, 'Chromium crashed.');
    expect(repository.markSuccess).not.toHaveBeenCalled();
  });
});
