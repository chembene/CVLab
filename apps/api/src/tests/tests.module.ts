import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TestsController } from './tests.controller';
import { TestSessionsController } from './test-sessions.controller';
import { TestsService } from './tests.service';
import { TestsRepository } from './tests.repository';

/**
 * The Technical Tests Engine (FASE 23, docs/architecture/technical-tests.md)
 * — the original roadmap's Phase 9 "Tests" requirement, built against the
 * `Test`/`Question`/`TestSession`/`TestAnswer` Prisma models that already
 * existed in the schema (dormant, never referenced by any service/
 * controller until this phase — see the audit in the phase report). No
 * AiOrchestrationModule, no CreditsModule — this capability is 100%
 * deterministic and free, matching ATS Analysis/CV Import extraction/Job
 * Import's own precedent, never AI-evaluated (that's Interview Practice's
 * job, Phase 10/9-in-the-implemented-numbering, a genuinely separate
 * feature this module never duplicates).
 */
@Module({
  imports: [AuthModule],
  controllers: [TestsController, TestSessionsController],
  providers: [TestsRepository, TestsService],
  exports: [TestsService],
})
export class TestsModule {}
