import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ResumeVariantModule } from '../resume-variant/resume-variant.module';
import { JobTargetModule } from '../job-target/job-target.module';
import { AtsController } from './ats.controller';
import { AtsAnalysisService } from './ats-analysis.service';
import { AtsReportRepository } from './ats-report.repository';

@Module({
  // AuthModule is imported for JwtAuthGuard. ResumeVariantModule/
  // JobTargetModule are imported so AtsAnalysisService can fetch a Variant
  // and its linked Job Target through their own ownership-checked service
  // methods, rather than reaching into their repositories directly.
  imports: [AuthModule, ResumeVariantModule, JobTargetModule],
  controllers: [AtsController],
  providers: [AtsReportRepository, AtsAnalysisService],
})
export class AtsModule {}
