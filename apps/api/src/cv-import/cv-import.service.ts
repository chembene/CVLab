import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { CvFileType, CvImport, MasterResume } from '@prisma/client';
import { InvalidPromptError } from '../ai-orchestration/errors/invalid-prompt.error';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ProfileService } from '../profile/profile.service';
import { MasterResumeService } from '../master-resume/master-resume.service';
import { ResumeSectionsService } from '../resume-sections/resume-sections.service';
import type { SectionType } from '../resume-sections/section-registry';
import { CVParser, normalizeEntityName } from './cv-parser';
import { CvImportRepository } from './cv-import.repository';
import type { CvMergeResolution, ExtractedCvData } from './interfaces/extracted-cv-data.interface';
import type { ConfirmCvImportDto } from './dto/confirm-cv-import.dto';
import { analyzeMerge, type ExistingSections, type MergePreview } from './cv-import-merge-analyzer';

/** Every section type this import module ever reads/writes — courses/publications aren't part of the canonical import model (brief §5) and stay manual-entry-only. */
const IMPORTABLE_SECTION_TYPES: SectionType[] = [
  'work-experience',
  'education',
  'skills',
  'languages',
  'certificates',
  'projects',
  'awards',
  'volunteer-experience',
  'references',
];

const ALLOWED_MIME_TYPES: Record<string, CvFileType> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
};

/** Hard ceiling enforced both by Multer (cv-import.controller.ts) and here as a defense-in-depth check. */
export const MAX_CV_FILE_SIZE_BYTES = 5 * 1024 * 1024;

export interface ConfirmCvImportResult {
  masterResume: MasterResume;
  skippedEntries: string[];
  /**
   * FASE 7 audit (2026-08-12) — entries the user resolved as
   * `mergeDecision: 'keep_existing'` against a possible-duplicate match
   * (see `cv-import-merge-analyzer.ts`) — the existing row was left
   * completely untouched, nothing was created.
   */
  keptExistingEntries: string[];
  /**
   * FASE 7 audit — entries the user resolved as `mergeDecision:
   * 'use_imported'` or `'merge'` — the matched existing row was updated
   * with the imported entry's fields (a non-destructive partial update:
   * only fields the imported entry actually provides are applied, so an
   * existing field the import didn't capture is never cleared out — see
   * `createOrResolveSectionEntry()`).
   */
  updatedEntries: string[];
}

/**
 * Orchestrates docs/architecture/cv-import.md's flow: Upload → (deterministic,
 * non-AI) Extraction → Preview → User confirms → Master Resume created. The
 * upload step never writes anything beyond the CvImport audit row itself —
 * "Never automatically save imported data" — Profile/MasterResume/section
 * rows are only created in confirm(), and only once, since
 * MasterResumeService.createForUser() enforces exactly one Master Resume
 * per user.
 */
@Injectable()
export class CvImportService {
  constructor(
    private readonly repository: CvImportRepository,
    private readonly parser: CVParser,
    private readonly profileService: ProfileService,
    private readonly masterResumeService: MasterResumeService,
    private readonly sectionsService: ResumeSectionsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async upload(
    requestingUser: RequestUser,
    targetUserId: string,
    file: Express.Multer.File | undefined,
  ): Promise<CvImport> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    if (!file) {
      throw new BadRequestException('Nenhum ficheiro foi enviado. Selecione um CV em PDF ou DOCX.');
    }
    const fileType = ALLOWED_MIME_TYPES[file.mimetype];
    if (!fileType) {
      throw new BadRequestException(
        'Formato de ficheiro não suportado. Envie o seu CV em PDF ou DOCX.',
      );
    }
    if (file.size > MAX_CV_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        'O ficheiro excede o limite de 5MB. Reduza o tamanho e tente novamente.',
      );
    }

    try {
      const rawText = await this.parser.extractText(file.buffer, fileType);
      const { data, confidence } = this.parser.parse(rawText);

      const created = await this.repository.create(targetUserId, {
        fileName: file.originalname,
        fileType,
        fileSizeBytes: file.size,
        status: 'EXTRACTED',
        rawTextExcerpt: rawText.slice(0, 2000),
        extractedData: data,
        fieldConfidence: confidence,
        creditsUsed: 0,
      });

      this.emit(targetUserId, created.id, 'imported');
      return created;
    } catch (error) {
      // Specific, actionable messages (brief §18) — never the generic
      // "import failed." An InvalidPromptError here is CVParser's own "no
      // extractable text" signal (e.g. a scanned/image-only PDF with no
      // text layer — OCR is a documented future limitation, see
      // docs/architecture/cv-import.md); anything else is an unexpected
      // extraction failure, distinct from a corrupt/mismatched file.
      const message =
        error instanceof InvalidPromptError
          ? 'Não conseguimos ler o conteúdo deste ficheiro. Verifique se o PDF contém texto selecionável (não apenas uma imagem digitalizada) e tente novamente.'
          : error instanceof Error
            ? `Não foi possível processar o ficheiro: ${error.message}`
            : 'Não foi possível processar o ficheiro enviado.';
      await this.repository.create(targetUserId, {
        fileName: file.originalname,
        fileType,
        fileSizeBytes: file.size,
        status: 'FAILED',
        creditsUsed: 0,
      });
      throw new BadRequestException(message);
    }
  }

  async list(requestingUser: RequestUser, targetUserId: string): Promise<CvImport[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.repository.findAllByUserId(targetUserId);
  }

  async getOne(requestingUser: RequestUser, targetUserId: string, id: string): Promise<CvImport> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  /**
   * Phase 12, brief §14/§15 — deterministic (no AI) "possible duplicate vs.
   * new" classification, computed BEFORE the user commits, so the review/
   * conflict-resolution screen can show "Encontrámos N possíveis
   * duplicados e M novas entradas" instead of only reporting skips after
   * the fact. Read-only — never mutates anything. Returns an all-new
   * preview (nothing existing to compare against) when the user has no
   * Master Resume yet.
   */
  async previewMerge(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<MergePreview> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const cvImport = await this.findOwnedOrThrow(targetUserId, id);
    const data = (cvImport.extractedData ?? {}) as unknown as ExtractedCvData;

    const existingMasterResume = await this.masterResumeService.getForUser(
      requestingUser,
      targetUserId,
    );
    if (!existingMasterResume) {
      return analyzeMerge(data, this.emptyExistingSections());
    }

    const existing = await this.loadExistingSections(requestingUser, targetUserId);
    return analyzeMerge(data, existing);
  }

  /**
   * Creates Profile fields (personal data), the Master Resume (summary),
   * and every section row the user confirmed. Entries missing a field the
   * database requires (e.g. a work experience with no parseable start
   * date) are skipped rather than filled with an invented placeholder —
   * returned in `skippedEntries` so the frontend can tell the user to add
   * them manually via the normal section editor.
   *
   * `dto.strategy` (brief §13/§35, only meaningful when a Master Resume
   * already exists): 'merge' (default) keeps every existing section row and
   * skips an exact duplicate; 'replace' soft-deletes every existing section
   * row first — an explicit, user-requested "start over," never automatic.
   */
  async confirm(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: ConfirmCvImportDto,
  ): Promise<ConfirmCvImportResult> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const cvImport = await this.findOwnedOrThrow(targetUserId, id);
    if (cvImport.status !== 'EXTRACTED') {
      throw new ConflictException(`Cannot confirm a CV import with status ${cvImport.status}.`);
    }

    const base = (cvImport.extractedData ?? {}) as unknown as ExtractedCvData;
    const data: ExtractedCvData = {
      personalData: dto.personalData ?? base.personalData ?? {},
      summary: dto.summary ?? base.summary,
      workExperiences: dto.workExperiences ?? base.workExperiences ?? [],
      educations: dto.educations ?? base.educations ?? [],
      skills: dto.skills ?? base.skills ?? [],
      languages: dto.languages ?? base.languages ?? [],
      certificates: dto.certificates ?? base.certificates ?? [],
      projects: dto.projects ?? base.projects ?? [],
      awards: dto.awards ?? base.awards ?? [],
      volunteerExperiences: dto.volunteerExperiences ?? base.volunteerExperiences ?? [],
      references: dto.references ?? base.references ?? [],
    };

    if (data.personalData.fullName || data.personalData.phone || data.personalData.address) {
      const [firstName, ...rest] = (data.personalData.fullName ?? '').split(/\s+/).filter(Boolean);
      await this.profileService.upsertForUser(requestingUser, targetUserId, {
        firstName,
        lastName: rest.join(' ') || undefined,
        phone: data.personalData.phone,
        country: data.personalData.country,
        city: data.personalData.city,
        address: data.personalData.address,
        linkedin: data.personalData.linkedin,
        github: data.personalData.github,
        portfolio: data.personalData.portfolio,
        website: data.personalData.website,
      });
    }

    // "Master Resume is populated/updated" (Phase — CV Import User Flow
    // Integration, primary goal) — confirm() must not assume this is the
    // user's first import. If one already exists (created manually, or by
    // an earlier confirmed import), merge into it via updateForUser()
    // instead of unconditionally calling createForUser(), which would 409.
    // Retrying the SAME (already-CONFIRMED) import is still rejected by the
    // status check above, before this branch is ever reached — this only
    // changes behavior for a genuinely new import against an existing
    // Master Resume, previously an unconditional 409.
    const existingMasterResume = await this.masterResumeService.getForUser(
      requestingUser,
      targetUserId,
    );
    const strategy = dto.strategy ?? 'merge';
    if (existingMasterResume && strategy === 'replace') {
      // "Never automatically replace it. Ask the user." — this branch only
      // ever runs when the frontend explicitly sent strategy:'replace',
      // itself only reachable from an explicit "Substituir" button click,
      // never a default.
      await this.wipeExistingSections(requestingUser, targetUserId);
    }
    const masterResume = existingMasterResume
      ? await this.masterResumeService.updateForUser(requestingUser, targetUserId, {
          summary: data.summary,
        })
      : await this.masterResumeService.createForUser(requestingUser, targetUserId, {
          summary: data.summary,
        });

    const skippedEntries: string[] = [];
    const keptExistingEntries: string[] = [];
    const updatedEntries: string[] = [];

    for (const exp of data.workExperiences) {
      const normalizedCompany = normalizeEntityName(exp.company);
      const normalizedPosition = normalizeEntityName(exp.position);
      if ((!normalizedCompany && !normalizedPosition) || !exp.startDate) {
        skippedEntries.push(
          `Work experience "${exp.position ?? exp.company ?? 'untitled'}" (missing start date)`,
        );
        continue;
      }
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'work-experience',
        `Work experience "${exp.position ?? exp.company}"`,
        exp,
        {
          company: normalizedCompany ?? normalizedPosition ?? 'Unknown',
          position: normalizedPosition ?? normalizedCompany ?? 'Unknown',
          location: normalizeEntityName(exp.location),
          startDate: exp.startDate,
          endDate: exp.endDate,
          currentlyWorking: exp.currentlyWorking ?? false,
          description: exp.description,
        },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    for (const edu of data.educations) {
      const normalizedInstitution = normalizeEntityName(edu.institution);
      if (!normalizedInstitution) {
        skippedEntries.push(`Education entry "${edu.degree ?? 'untitled'}" (missing institution)`);
        continue;
      }
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'education',
        `Education entry "${edu.institution}"`,
        edu,
        {
          institution: normalizedInstitution,
          degree: normalizeEntityName(edu.degree),
          field: normalizeEntityName(edu.field),
          startDate: edu.startDate,
          endDate: edu.endDate,
          description: edu.description,
        },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    for (const skill of data.skills) {
      if (!skill.name) continue;
      const name = normalizeEntityName(skill.name);
      if (!name) continue;
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'skills',
        `Skill "${name}"`,
        skill,
        { name },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    for (const language of data.languages) {
      if (!language.language) continue;
      const languageName = normalizeEntityName(language.language);
      if (!languageName) continue;
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'languages',
        `Language "${languageName}"`,
        language,
        { language: languageName, proficiency: normalizeEntityName(language.proficiency) },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    for (const cert of data.certificates) {
      const normalizedTitle = normalizeEntityName(cert.title);
      if (!normalizedTitle) {
        skippedEntries.push(`Certificate "${cert.issuer ?? 'untitled'}" (missing title)`);
        continue;
      }
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'certificates',
        `Certificate "${normalizedTitle}"`,
        cert,
        {
          title: normalizedTitle,
          issuer: normalizeEntityName(cert.issuer),
          issueDate: cert.issueDate,
        },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    for (const project of data.projects) {
      const normalizedTitle = normalizeEntityName(project.title);
      if (!normalizedTitle) {
        skippedEntries.push('Project (missing title)');
        continue;
      }
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'projects',
        `Project "${normalizedTitle}"`,
        project,
        { title: normalizedTitle, description: project.description, url: project.url },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    for (const award of data.awards) {
      const normalizedTitle = normalizeEntityName(award.title);
      if (!normalizedTitle) {
        skippedEntries.push('Award (missing title)');
        continue;
      }
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'awards',
        `Award "${normalizedTitle}"`,
        award,
        {
          title: normalizedTitle,
          issuer: normalizeEntityName(award.issuer),
          dateAwarded: award.dateAwarded,
          description: award.description,
        },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    for (const volunteer of data.volunteerExperiences) {
      const normalizedOrganization = normalizeEntityName(volunteer.organization);
      if (!normalizedOrganization) {
        skippedEntries.push(
          `Volunteer experience "${volunteer.role ?? 'untitled'}" (missing organization)`,
        );
        continue;
      }
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'volunteer-experience',
        `Volunteer experience "${volunteer.role ?? normalizedOrganization}"`,
        volunteer,
        {
          organization: normalizedOrganization,
          role: normalizeEntityName(volunteer.role),
          startDate: volunteer.startDate,
          endDate: volunteer.endDate,
          currentlyVolunteering: volunteer.currentlyVolunteering ?? false,
          description: volunteer.description,
        },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    for (const reference of data.references) {
      const normalizedName = normalizeEntityName(reference.name);
      if (!normalizedName) {
        skippedEntries.push('Reference (missing name)');
        continue;
      }
      await this.createOrResolveSectionEntry(
        requestingUser,
        targetUserId,
        'references',
        `Reference "${normalizedName}"`,
        reference,
        {
          name: normalizedName,
          position: normalizeEntityName(reference.position),
          company: normalizeEntityName(reference.company),
          email: reference.email,
          phone: reference.phone,
        },
        skippedEntries,
        keptExistingEntries,
        updatedEntries,
      );
    }

    await this.repository.update(id, { status: 'CONFIRMED', masterResumeId: masterResume.id });
    this.emit(targetUserId, id, 'confirmed', {
      masterResumeId: masterResume.id,
      skippedCount: skippedEntries.length,
    });
    // Additional, more specific audit event (brief §29) when this confirm
    // was against a pre-existing Master Resume — 'merged' or 'replaced' on
    // top of (not instead of) the generic 'confirmed' event above, so
    // existing history queries filtering on 'confirmed' keep working.
    if (existingMasterResume) {
      this.emit(targetUserId, id, strategy === 'replace' ? 'replaced' : 'merged', {
        masterResumeId: masterResume.id,
      });
    }

    return { masterResume, skippedEntries, keptExistingEntries, updatedEntries };
  }

  async discard(requestingUser: RequestUser, targetUserId: string, id: string): Promise<CvImport> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    if (existing.status === 'CONFIRMED') {
      throw new ConflictException('A confirmed CV import cannot be discarded.');
    }

    const updated = await this.repository.update(id, { status: 'DISCARDED' });
    this.emit(targetUserId, id, 'discarded');
    return updated;
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.repository.softDelete(id);
    this.emit(targetUserId, id, 'deleted');
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<CvImport> {
    const cvImport = await this.repository.findById(id);
    if (!cvImport || cvImport.userId !== targetUserId) {
      throw new NotFoundException('CV import not found.');
    }
    return cvImport;
  }

  private emit(
    userId: string,
    cvImportId: string,
    action: 'imported' | 'confirmed' | 'merged' | 'replaced' | 'discarded' | 'deleted',
    metadata?: Record<string, unknown>,
  ): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, 'cv_import', cvImportId, action, metadata),
    );
  }

  /** Every existing section row across all 9 importable section types, for previewMerge()'s comparison base — see ExistingSections. */
  private async loadExistingSections(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<ExistingSections> {
    const [
      workExperiences,
      educations,
      skills,
      languages,
      certificates,
      projects,
      awards,
      volunteerExperiences,
      references,
    ] = await Promise.all([
      this.sectionsService.list('work-experience', requestingUser, targetUserId),
      this.sectionsService.list('education', requestingUser, targetUserId),
      this.sectionsService.list('skills', requestingUser, targetUserId),
      this.sectionsService.list('languages', requestingUser, targetUserId),
      this.sectionsService.list('certificates', requestingUser, targetUserId),
      this.sectionsService.list('projects', requestingUser, targetUserId),
      this.sectionsService.list('awards', requestingUser, targetUserId),
      this.sectionsService.list('volunteer-experience', requestingUser, targetUserId),
      this.sectionsService.list('references', requestingUser, targetUserId),
    ]);
    return {
      workExperiences,
      educations,
      skills,
      languages,
      certificates,
      projects,
      awards,
      volunteerExperiences,
      references,
    };
  }

  private emptyExistingSections(): ExistingSections {
    return {
      workExperiences: [],
      educations: [],
      skills: [],
      languages: [],
      certificates: [],
      projects: [],
      awards: [],
      volunteerExperiences: [],
      references: [],
    };
  }

  /**
   * `strategy: 'replace'` (brief §13/§35) — soft-deletes every existing
   * active section row before confirm() creates the imported ones, giving
   * the user a genuine "start over" option. Only ever called after an
   * explicit user choice; confirm()'s default ('merge') never touches this.
   * Reuses ResumeSectionsService.remove() one row at a time — respects the
   * same module-boundary rule as the rest of this service (a feature module
   * composes another domain's service layer, never its repository
   * directly) rather than reaching into Prisma for a bulk delete.
   */
  private async wipeExistingSections(
    requestingUser: RequestUser,
    targetUserId: string,
  ): Promise<void> {
    for (const sectionType of IMPORTABLE_SECTION_TYPES) {
      const rows = await this.sectionsService.list(sectionType, requestingUser, targetUserId);
      for (const row of rows) {
        await this.sectionsService.remove(sectionType, requestingUser, targetUserId, row.id);
      }
    }
  }

  /**
   * A duplicate entry (case-insensitive match on an existing section row —
   * only enforced for skills/certificates/educations, see
   * ResumeSectionsService.assertNoDuplicate) must be skipped like a
   * missing-required-field entry, never allowed to abort the rest of
   * confirm() — otherwise a re-import against an existing Master Resume
   * fails with a raw 409 partway through, leaving some sections created and
   * the CvImport row stuck at EXTRACTED.
   */
  private async createSectionOrSkip(
    requestingUser: RequestUser,
    targetUserId: string,
    sectionType: SectionType,
    label: string,
    skippedEntries: string[],
    dto: object,
  ): Promise<void> {
    try {
      await this.sectionsService.create(sectionType, requestingUser, targetUserId, dto);
    } catch (error) {
      if (error instanceof ConflictException) {
        skippedEntries.push(`${label} (already exists on this resume)`);
        return;
      }
      throw error;
    }
  }

  /**
   * FASE 7 audit (2026-08-12) — routes one extracted entry to create/
   * update/skip depending on whether the user resolved it against a
   * `GET :id/merge-preview` possible-duplicate match
   * (`entry.mergeDecision`/`entry.existingSectionId`, see
   * `CvMergeResolution`):
   *
   *  - No decision (both fields absent — every entry that was never
   *    flagged, or one the user never explicitly resolved): unchanged
   *    pre-FASE-7 behavior, `createSectionOrSkip()`.
   *  - `'keep_existing'`: nothing is created or changed — the existing row
   *    is left exactly as it was.
   *  - `'use_imported'` / `'merge'`: updates the existing row via
   *    `ResumeSectionsService.update()`, but only with the fields `dto`
   *    actually has a defined value for — Prisma's partial update leaves
   *    every other column untouched. This is deliberately
   *    non-destructive: an existing field the imported entry didn't
   *    capture (e.g. a `location` the import never found) is never nulled
   *    out, per CLAUDE.md's "never invent" and "never delete existing work"
   *    rules applied to data as well as code. The two decisions share this
   *    exact mechanism on purpose — the distinction between "usar
   *    importado" and "mesclar" is a UX preference for the user, not a
   *    data-destruction one; neither is allowed to silently erase real
   *    existing content the import simply didn't capture.
   *  - A stale `existingSectionId` (the referenced row was deleted or
   *    belongs to a different resume between preview and confirm) is
   *    caught and recorded in `skippedEntries`, never allowed to abort the
   *    rest of confirm().
   */
  private async createOrResolveSectionEntry(
    requestingUser: RequestUser,
    targetUserId: string,
    sectionType: SectionType,
    label: string,
    resolution: CvMergeResolution,
    dto: Record<string, unknown>,
    skippedEntries: string[],
    keptExistingEntries: string[],
    updatedEntries: string[],
  ): Promise<void> {
    if (resolution.mergeDecision === 'keep_existing') {
      keptExistingEntries.push(label);
      return;
    }

    if (
      (resolution.mergeDecision === 'use_imported' || resolution.mergeDecision === 'merge') &&
      resolution.existingSectionId
    ) {
      const definedFields = Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      );
      try {
        await this.sectionsService.update(
          sectionType,
          requestingUser,
          targetUserId,
          resolution.existingSectionId,
          definedFields,
        );
        updatedEntries.push(label);
      } catch (error) {
        if (error instanceof NotFoundException) {
          skippedEntries.push(
            `${label} (the existing entry referenced by this decision was no longer found)`,
          );
          return;
        }
        throw error;
      }
      return;
    }

    await this.createSectionOrSkip(
      requestingUser,
      targetUserId,
      sectionType,
      label,
      skippedEntries,
      dto,
    );
  }
}
