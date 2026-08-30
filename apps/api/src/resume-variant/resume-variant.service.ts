import { Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import type {
  MasterResume,
  ResumeVariant,
  ResumeVariantVersion,
  ResumeVersionLabel,
} from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import {
  RESUME_ENTITY_CHANGED_EVENT,
  ResumeEntityChangedEvent,
} from '../common/events/resume-entity-changed.event';
import { AppLogger } from '../common/logger/app-logger.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { MasterResumeRepository } from '../master-resume/master-resume.repository';
import { ResumeSectionsRepository } from '../resume-sections/resume-sections.repository';
import { SECTION_DEFINITIONS, type SectionType } from '../resume-sections/section-registry';
import { JobTargetService } from '../job-target/job-target.service';
import { ResumeVersionRepository } from '../resume-version/resume-version.repository';
import { ResumeTemplateRepository } from '../template-engine/resume-template.repository';
import type { ThemeOverridesDto } from '../template-engine/dto/theme-overrides.dto';
import { ResumeVariantRepository } from './resume-variant.repository';
import { calculateVariantCompletion } from './resume-variant-completion.util';
import { SECTION_TYPE_TO_CONTENT_KEY, toSnapshotSection } from './resume-variant-snapshot.util';
import type { CreateResumeVariantDto } from './dto/create-resume-variant.dto';
import type { UpdateResumeVariantDto } from './dto/update-resume-variant.dto';
import type { DuplicateResumeVariantDto } from './dto/duplicate-resume-variant.dto';
import type { SaveCheckpointDto } from './dto/save-checkpoint.dto';

type VariantAction = 'created' | 'updated' | 'archived' | 'restored' | 'deleted';

interface SnapshotOptions {
  label: ResumeVersionLabel;
  customLabel?: string;
  source: 'USER' | 'AI';
  jobTargetId?: string | null;
  coverLetterId?: string;
  notes?: string;
  changeSummary?: string;
}

/**
 * Owner-only (+ admin bypass) CRUD for Resume Variants, plus the
 * duplicate/archive/restore state transitions, plus (Phase 10.5) Resume
 * Version History: every content-changing action snapshots a
 * ResumeVariantVersion row — see docs/architecture/resume-version-history.md.
 * A Variant is an independent snapshot of the Master Resume taken at
 * creation/duplication time — see
 * docs/architecture/master-resume-data-model.md §9. Nothing here ever
 * writes back to MasterResume or its sections.
 */
@Injectable()
export class ResumeVariantService {
  private readonly logger = new AppLogger(ResumeVariantService.name);

  constructor(
    private readonly variantRepository: ResumeVariantRepository,
    private readonly masterResumeRepository: MasterResumeRepository,
    private readonly sectionsRepository: ResumeSectionsRepository,
    private readonly jobTargetService: JobTargetService,
    private readonly versionRepository: ResumeVersionRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly templateRepository: ResumeTemplateRepository,
  ) {}

  async list(requestingUser: RequestUser, targetUserId: string): Promise<ResumeVariant[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.variantRepository.findAllByUserId(targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, id);
  }

  async create(
    requestingUser: RequestUser,
    targetUserId: string,
    dto: CreateResumeVariantDto,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);

    const masterResume = await this.masterResumeRepository.findByUserId(targetUserId);
    if (!masterResume) {
      throw new NotFoundException('Create a master resume before creating variants.');
    }
    if (dto.jobTargetId) {
      await this.jobTargetService.assertOwnedJobTarget(
        requestingUser,
        targetUserId,
        dto.jobTargetId,
      );
    }

    const content = await this.buildSnapshot(masterResume);
    const completionPercentage = calculateVariantCompletion(dto.title, content);

    const variant = await this.variantRepository.create(targetUserId, masterResume.id, {
      title: dto.title,
      jobTargetId: dto.jobTargetId,
      status: dto.status,
      content: content as Prisma.InputJsonValue,
      completionPercentage,
    });

    // recordInitialVersion(), NOT recordVersion() — the row variantRepository
    // just created already starts at the schema's version:1 default, which
    // is already the correct number for this INITIAL row; recordVersion()'s
    // applyEdit() would bump it to 2, one ahead of reality.
    await this.recordInitialVersion(
      requestingUser,
      variant,
      variant.content as Record<string, unknown>,
      {
        label: 'INITIAL',
        source: 'USER',
        jobTargetId: variant.jobTargetId,
        changeSummary: 'Initial version',
      },
    );

    this.emit(targetUserId, variant.id, 'created');
    return variant;
  }

  async update(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: UpdateResumeVariantDto,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);

    if (dto.jobTargetId) {
      await this.jobTargetService.assertOwnedJobTarget(
        requestingUser,
        targetUserId,
        dto.jobTargetId,
      );
    }

    let completionPercentage = existing.completionPercentage;
    if (dto.content || dto.title) {
      const nextTitle = dto.title ?? existing.title;
      const nextContent = dto.content ?? (existing.content as Record<string, unknown>);
      completionPercentage = calculateVariantCompletion(nextTitle, nextContent);
    }

    let updated: ResumeVariant;
    if (dto.content) {
      // Content edit — "every important edit creates a new version" (rule 1).
      // recordVersion() itself performs the version-bumping applyEdit(), so
      // the extra title/status/jobTargetId fields ride along on that single
      // call via extraFields rather than a separate applyEdit() — applyEdit()
      // must only run once per edit, or ResumeVariant.version drifts out of
      // lockstep with the ResumeVariantVersion row count (see recordVersion's
      // own comment).
      const result = await this.recordVersion(
        requestingUser,
        existing,
        dto.content,
        {
          label: 'MANUAL_EDIT',
          source: 'USER',
          jobTargetId: dto.jobTargetId ?? existing.jobTargetId,
          changeSummary: 'Manual edit',
        },
        {
          title: dto.title,
          status: dto.status,
          jobTargetId: dto.jobTargetId,
          completionPercentage,
        },
      );
      updated = result.variant;
    } else {
      // Metadata-only change (title/status/jobTargetId) — no content
      // change, so no version snapshot; plain update, no version bump.
      updated = await this.variantRepository.update(id, {
        title: dto.title,
        status: dto.status,
        jobTargetId: dto.jobTargetId,
        completionPercentage,
      });
    }

    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  async duplicate(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: DuplicateResumeVariantDto,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const source = await this.findOwnedOrThrow(targetUserId, id);

    const variant = await this.variantRepository.create(targetUserId, source.masterResumeId, {
      title: dto.title ?? `${source.title} (copy)`,
      jobTargetId: source.jobTargetId ?? undefined,
      status: 'DRAFT',
      content: source.content as Prisma.InputJsonValue,
      completionPercentage: source.completionPercentage,
    });

    await this.recordInitialVersion(
      requestingUser,
      variant,
      variant.content as Record<string, unknown>,
      {
        label: 'INITIAL',
        source: 'USER',
        jobTargetId: variant.jobTargetId,
        changeSummary: `Duplicated from "${source.title}"`,
      },
    );

    // A duplicate is a brand new, independent row — "created", not "updated".
    this.emit(targetUserId, variant.id, 'created');
    return variant;
  }

  /** "Duplicate version. Creates a completely independent Resume Variant" (rule 6) — from a specific *historical* version, not necessarily the live content. */
  async duplicateFromVersion(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    versionNumber: number,
    dto: DuplicateResumeVariantDto,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const source = await this.findOwnedOrThrow(targetUserId, id);
    const historical = await this.findOwnedVersionOrThrow(targetUserId, id, versionNumber);

    const content = historical.content as Record<string, unknown>;
    const title = dto.title ?? `${source.title} (v${versionNumber} copy)`;
    const completionPercentage = calculateVariantCompletion(title, content);

    const variant = await this.variantRepository.create(targetUserId, source.masterResumeId, {
      title,
      jobTargetId: source.jobTargetId ?? undefined,
      status: 'DRAFT',
      content: historical.content as Prisma.InputJsonValue,
      completionPercentage,
    });

    await this.recordInitialVersion(requestingUser, variant, content, {
      label: 'INITIAL',
      source: 'USER',
      jobTargetId: variant.jobTargetId,
      changeSummary: `Duplicated from version ${versionNumber} of "${source.title}"`,
    });

    this.emit(targetUserId, variant.id, 'created');
    return variant;
  }

  /** "Save Version" (rule 2, manual checkpoint) — snapshots the current content unchanged, under a chosen label/note. */
  async saveCheckpoint(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    dto: SaveCheckpointDto,
  ): Promise<ResumeVariantVersion> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const variant = await this.findOwnedOrThrow(targetUserId, id);

    const { version } = await this.recordVersion(
      requestingUser,
      variant,
      variant.content as Record<string, unknown>,
      {
        label: dto.label ?? 'CUSTOM',
        customLabel: dto.customLabel,
        source: 'USER',
        jobTargetId: variant.jobTargetId,
        notes: dto.notes,
        changeSummary: 'Manual checkpoint',
      },
    );
    // Every other state-changing action on this service emits a history
    // event (update/restore -> 'updated', create/duplicate -> 'created');
    // a manual checkpoint is content-preserving but still a deliberate
    // user action worth the same visibility in the Version Timeline (rule 3).
    this.emit(targetUserId, id, 'updated');
    return version;
  }

  /**
   * "Restore version. Restoring creates a NEW version. Never overwrite
   * history" (rule 5) — copies a historical version's content back onto
   * the live Variant; the version being restored FROM is untouched.
   */
  async restoreVersion(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    versionNumber: number,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    const historical = await this.findOwnedVersionOrThrow(targetUserId, id, versionNumber);
    const content = historical.content as Record<string, unknown>;

    const { variant: updated } = await this.recordVersion(
      requestingUser,
      existing,
      content,
      {
        label: 'CUSTOM',
        customLabel: `Restored from version ${versionNumber}`,
        source: 'USER',
        jobTargetId: existing.jobTargetId,
        changeSummary: `Restored from version ${versionNumber}`,
      },
      {
        completionPercentage: calculateVariantCompletion(existing.title, content),
      },
    );

    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  /**
   * Auto-snapshot hook (rule 8) — called by ResumeOptimizationService,
   * AtsAnalysisService, CoverLetterService, and InterviewService right
   * before their own AI/analysis logic runs, and again by
   * ResumeOptimizationService.apply() right after it mutates content.
   * Snapshot failures are logged and swallowed, never propagated — a
   * missed audit snapshot must never block the user's actual requested
   * action. See docs/architecture/resume-version-history.md "Auto-Snapshot
   * Hooks".
   */
  async snapshotBeforeAiAction(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
    opts: {
      label: ResumeVersionLabel;
      changeSummary: string;
      jobTargetId?: string;
      coverLetterId?: string;
    },
  ): Promise<void> {
    try {
      assertOwnerOrAdmin(requestingUser, targetUserId);
      const variant = await this.findOwnedOrThrow(targetUserId, variantId);
      await this.recordVersion(
        requestingUser,
        variant,
        variant.content as Record<string, unknown>,
        {
          label: opts.label,
          source: 'AI',
          jobTargetId: opts.jobTargetId ?? variant.jobTargetId,
          coverLetterId: opts.coverLetterId,
          changeSummary: opts.changeSummary,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to record an auto-snapshot for resume variant ${variantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Snapshots content that was already persisted by the caller — e.g.
   * ResumeOptimizationService.apply(), which writes the new content via
   * ResumeVariantRepository.applyEdit() *inside its own transaction*
   * (atomically with marking suggestions applied), then passes in the
   * resulting `variant` (already carrying the post-edit `.version`). This
   * writes the matching ResumeVariantVersion row directly via
   * versionRepository.create() — it deliberately does NOT go through
   * recordVersion()/applyEdit() again, which would bump `.version` a SECOND
   * time for the same edit and break the version-counter/row-count
   * invariant (see recordVersion's own comment). `variant.version` here is
   * trusted as the authoritative, already-bumped number.
   */
  async recordAppliedContentVersion(
    requestingUser: RequestUser,
    targetUserId: string,
    variant: ResumeVariant,
    content: Record<string, unknown>,
    opts: { changeSummary: string },
  ): Promise<void> {
    try {
      await this.versionRepository.create({
        resumeVariantId: variant.id,
        versionNumber: variant.version,
        content: content as Prisma.InputJsonValue,
        label: 'AI_OPTIMIZED',
        source: 'AI',
        createdByUserId: requestingUser.id,
        jobTargetId: variant.jobTargetId ?? undefined,
        changeSummary: opts.changeSummary,
      });
    } catch (error) {
      this.logger.error(
        `Failed to record the applied-suggestions version for resume variant ${variant.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Used by ApplicationService — "every job application must permanently reference the exact Resume Version used" (rule 9). Always creates a fresh snapshot, guaranteeing an exact-content capture regardless of whether a matching version already exists. */
  async snapshotForApplication(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
  ): Promise<ResumeVariantVersion> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const variant = await this.findOwnedOrThrow(targetUserId, variantId);
    const { version } = await this.recordVersion(
      requestingUser,
      variant,
      variant.content as Record<string, unknown>,
      {
        label: 'APPLICATION_VERSION',
        source: 'USER',
        jobTargetId: variant.jobTargetId,
        changeSummary: 'Snapshot taken at application submission',
      },
    );
    return version;
  }

  /**
   * Phase 11 Template Engine, Part 13 — "Store selected template... Do NOT
   * duplicate Resume data." A plain field update, like archive/restore —
   * NOT a content edit, so no version bump and no ResumeVariantVersion row:
   * "Presentation must never alter stored content" cuts both ways, content
   * changes don't touch presentation and presentation changes don't touch
   * content/history.
   */
  async setTemplate(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    templateId: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);
    const template = await this.templateRepository.findById(templateId);
    if (!template) {
      throw new NotFoundException('Modelo de currículo não encontrado.');
    }

    const updated = await this.variantRepository.update(id, { templateId });
    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  /**
   * Part 6 "Theme Customization" — same plain-field-update rationale as
   * setTemplate(). Wholesale-replaces the stored overrides with exactly
   * what's given (omitted DTO fields simply aren't overridden — not merged
   * with whatever was stored before), matching this codebase's existing
   * "PUT replaces wholesale" precedent (ResumeVariant.content, Job Target's
   * child collections). Use resetTheme() to clear back to the template's
   * own defaults entirely.
   */
  async updateTheme(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
    themeOverrides: ThemeOverridesDto,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    const updated = await this.variantRepository.update(id, {
      themeOverrides: themeOverrides as Prisma.InputJsonValue,
    });
    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  /** Clears themeOverrides back to SQL NULL — "use the template's defaults unchanged". */
  async resetTheme(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    const updated = await this.variantRepository.update(id, { themeOverrides: Prisma.DbNull });
    this.emit(targetUserId, id, 'updated');
    return updated;
  }

  async archive(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    if (existing.archived) {
      return existing; // idempotent no-op — no duplicate history event
    }

    const updated = await this.variantRepository.update(id, { archived: true });
    this.emit(targetUserId, id, 'archived');
    return updated;
  }

  async restore(
    requestingUser: RequestUser,
    targetUserId: string,
    id: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const existing = await this.findOwnedOrThrow(targetUserId, id);
    if (!existing.archived) {
      return existing; // idempotent no-op
    }

    const updated = await this.variantRepository.update(id, { archived: false });
    this.emit(targetUserId, id, 'restored');
    return updated;
  }

  async remove(requestingUser: RequestUser, targetUserId: string, id: string): Promise<void> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    await this.findOwnedOrThrow(targetUserId, id);

    await this.variantRepository.softDelete(id);
    this.emit(targetUserId, id, 'deleted');
  }

  /** Used by ApplicationService to verify a resume variant belongs to the applying user before an Application can reference it. */
  async assertOwnedVariant(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
  ): Promise<ResumeVariant> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(targetUserId, variantId);
  }

  private async findOwnedOrThrow(targetUserId: string, id: string): Promise<ResumeVariant> {
    const variant = await this.variantRepository.findById(id);
    if (!variant || variant.userId !== targetUserId) {
      throw new NotFoundException('Resume variant not found.');
    }
    return variant;
  }

  private async findOwnedVersionOrThrow(
    targetUserId: string,
    variantId: string,
    versionNumber: number,
  ): Promise<ResumeVariantVersion> {
    const version = await this.versionRepository.findOneByVariantAndNumber(
      variantId,
      versionNumber,
      targetUserId,
    );
    if (!version) {
      throw new NotFoundException('Resume version not found.');
    }
    return version;
  }

  /**
   * The one place every version-creating action funnels through — bumps
   * `ResumeVariant.version` (via a single `applyEdit()` call) and writes a
   * matching `ResumeVariantVersion` row, keeping the two in lockstep.
   * `extraFields` lets a caller that also needs to change title/status/
   * jobTargetId/completionPercentage ride those along on the SAME
   * `applyEdit()` call instead of issuing a second one — `applyEdit()` must
   * run exactly once per version-creating action, or `ResumeVariant.version`
   * drifts ahead of the actual `ResumeVariantVersion` row count.
   */
  private async recordVersion(
    requestingUser: RequestUser,
    variant: ResumeVariant,
    content: Record<string, unknown>,
    opts: SnapshotOptions,
    extraFields?: Omit<import('./resume-variant.repository').ResumeVariantData, 'content'>,
  ): Promise<{ variant: ResumeVariant; version: ResumeVariantVersion }> {
    const updated = await this.variantRepository.applyEdit(variant.id, {
      ...extraFields,
      content: content as Prisma.InputJsonValue,
    });
    const version = await this.versionRepository.create({
      resumeVariantId: variant.id,
      versionNumber: updated.version,
      content: content as Prisma.InputJsonValue,
      label: opts.label,
      customLabel: opts.customLabel,
      source: opts.source,
      createdByUserId: requestingUser.id,
      jobTargetId: opts.jobTargetId ?? undefined,
      coverLetterId: opts.coverLetterId,
      notes: opts.notes,
      changeSummary: opts.changeSummary,
    });
    return { variant: updated, version };
  }

  /**
   * Writes the ResumeVariantVersion row for a variant `variantRepository`
   * JUST created — used by create(), duplicate(), and duplicateFromVersion()
   * only. Deliberately does NOT call applyEdit(): a freshly-created row
   * already starts at the schema's `version: 1` default (or, for a
   * duplicate, its own independent `1`), which is already the correct
   * number for this first row — bumping it here would leave the returned
   * `ResumeVariant.version` (1) out of sync with both the persisted DB row
   * (2) and the ResumeVariantVersion.versionNumber just written (2).
   */
  private async recordInitialVersion(
    requestingUser: RequestUser,
    variant: ResumeVariant,
    content: Record<string, unknown>,
    opts: SnapshotOptions,
  ): Promise<ResumeVariantVersion> {
    return this.versionRepository.create({
      resumeVariantId: variant.id,
      versionNumber: variant.version,
      content: content as Prisma.InputJsonValue,
      label: opts.label,
      customLabel: opts.customLabel,
      source: opts.source,
      createdByUserId: requestingUser.id,
      jobTargetId: opts.jobTargetId ?? undefined,
      coverLetterId: opts.coverLetterId,
      notes: opts.notes,
      changeSummary: opts.changeSummary,
    });
  }

  /** Copies the Master Resume's own fields + all 11 live sections into a plain, self-contained content object — a one-time read, never a live link. */
  private async buildSnapshot(masterResume: MasterResume): Promise<Record<string, unknown>> {
    const content: Record<string, unknown> = {
      title: masterResume.title,
      summary: masterResume.summary,
      careerLevel: masterResume.careerLevel,
      yearsExperience: masterResume.yearsExperience,
      desiredPosition: masterResume.desiredPosition,
      desiredSalary: masterResume.desiredSalary != null ? Number(masterResume.desiredSalary) : null,
      currency: masterResume.currency,
    };

    for (const sectionType of Object.keys(SECTION_DEFINITIONS) as SectionType[]) {
      const records = await this.sectionsRepository.findAllByResumeId(sectionType, masterResume.id);
      content[SECTION_TYPE_TO_CONTENT_KEY[sectionType]] = records.map(toSnapshotSection);
    }

    return content;
  }

  private emit(userId: string, variantId: string, action: VariantAction): void {
    this.eventEmitter.emit(
      RESUME_ENTITY_CHANGED_EVENT,
      new ResumeEntityChangedEvent(userId, 'resume_variant', variantId, action),
    );
  }
}
