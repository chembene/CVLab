import { Injectable, NotFoundException } from '@nestjs/common';
import type { ResumeVariantVersion } from '@prisma/client';
import { assertOwnerOrAdmin } from '../common/authorization/assert-owner-or-admin.util';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { ResumeVersionRepository } from './resume-version.repository';
import { ResumeDiffService, type ResumeVersionDiff } from './resume-diff.service';

/**
 * Read-only operations over the Resume Version History timeline — listing,
 * reading one version, and comparing two. Deliberately has zero dependency
 * on ResumeVariantModule (ownership is enforced by
 * ResumeVersionRepository's queries, which join through the `resumeVariant`
 * relation) — see docs/architecture/resume-version-history.md "Module
 * Boundaries" for why: ResumeVariantModule needs to create version rows
 * on every edit, so it depends on this module (via ResumeVersionRepository);
 * this module cannot depend back on ResumeVariantModule without a cycle.
 */
@Injectable()
export class ResumeVersionService {
  constructor(
    private readonly versionRepository: ResumeVersionRepository,
    private readonly diffService: ResumeDiffService,
  ) {}

  async listTimeline(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
  ): Promise<ResumeVariantVersion[]> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.versionRepository.findAllByVariantId(variantId, targetUserId);
  }

  async getOne(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
    versionNumber: number,
  ): Promise<ResumeVariantVersion> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    return this.findOwnedOrThrow(variantId, versionNumber, targetUserId);
  }

  async compare(
    requestingUser: RequestUser,
    targetUserId: string,
    variantId: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<ResumeVersionDiff> {
    assertOwnerOrAdmin(requestingUser, targetUserId);
    const [from, to] = await Promise.all([
      this.findOwnedOrThrow(variantId, fromVersion, targetUserId),
      this.findOwnedOrThrow(variantId, toVersion, targetUserId),
    ]);

    return this.diffService.compare(
      from.versionNumber,
      to.versionNumber,
      from.content as Record<string, unknown>,
      to.content as Record<string, unknown>,
    );
  }

  private async findOwnedOrThrow(
    variantId: string,
    versionNumber: number,
    ownerUserId: string,
  ): Promise<ResumeVariantVersion> {
    const version = await this.versionRepository.findOneByVariantAndNumber(
      variantId,
      versionNumber,
      ownerUserId,
    );
    if (!version) {
      throw new NotFoundException('Resume version not found.');
    }
    return version;
  }
}
