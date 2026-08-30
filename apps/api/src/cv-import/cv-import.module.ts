import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfileModule } from '../profile/profile.module';
import { MasterResumeModule } from '../master-resume/master-resume.module';
import { ResumeSectionsModule } from '../resume-sections/resume-sections.module';
import { CvImportController } from './cv-import.controller';
import { CvImportService } from './cv-import.service';
import { CvImportRepository } from './cv-import.repository';
import { CVParser } from './cv-parser';

/**
 * The CV Import Engine (Phase 10.5) — see docs/architecture/cv-import.md.
 * Composes Profile/MasterResume/ResumeSections exactly like every other
 * feature module in this codebase: through their exported services, never
 * raw Prisma access from here.
 */
@Module({
  imports: [AuthModule, ProfileModule, MasterResumeModule, ResumeSectionsModule],
  controllers: [CvImportController],
  providers: [CvImportRepository, CvImportService, CVParser],
  exports: [CvImportService],
})
export class CvImportModule {}
