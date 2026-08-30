import { Injectable } from '@nestjs/common';
import type { ApplicationPipelineSession, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Only Prisma access for `application_pipeline_sessions` lives here.
 * `currentStep`'s schema-level default (`JOB_IMPORT`) is deliberately
 * overridden to `ATS_ANALYSIS` on create() — a session cannot exist without
 * an already-selected, already-linked Job Target (both are required,
 * non-nullable columns), so "import/select the job" is already satisfied by
 * the time a row exists; there is no separate JOB_IMPORT action for this
 * service to perform. See docs/architecture/application-pipeline.md
 * §"Steps".
 */
@Injectable()
export class ApplicationPipelineRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    userId: string,
    resumeVariantId: string,
    jobTargetId: string,
  ): Promise<ApplicationPipelineSession> {
    return this.prisma.applicationPipelineSession.create({
      data: { userId, resumeVariantId, jobTargetId, currentStep: 'ATS_ANALYSIS' },
    });
  }

  findById(id: string): Promise<ApplicationPipelineSession | null> {
    return this.prisma.applicationPipelineSession.findFirst({ where: { id, deletedAt: null } });
  }

  findAllByUserId(userId: string): Promise<ApplicationPipelineSession[]> {
    return this.prisma.applicationPipelineSession.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  update(
    id: string,
    data: Prisma.ApplicationPipelineSessionUpdateInput,
  ): Promise<ApplicationPipelineSession> {
    return this.prisma.applicationPipelineSession.update({ where: { id }, data });
  }
}
