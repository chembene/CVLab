import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { JobTargetController } from './job-target.controller';
import { JobTargetService } from './job-target.service';
import { JobTargetRepository } from './job-target.repository';
import { JobTargetAnalysisService } from './job-target-analysis.service';

@Module({
  // AuthModule is imported for JwtAuthGuard (used via @UseGuards on
  // JobTargetController), which itself depends on TokenService.
  imports: [AuthModule],
  controllers: [JobTargetController],
  providers: [JobTargetRepository, JobTargetService, JobTargetAnalysisService],
  // JobTargetService is exported for ApplicationModule, which needs to
  // verify a job target belongs to the applying user before an Application
  // can reference it.
  exports: [JobTargetService],
})
export class JobTargetModule {}
