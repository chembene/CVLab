import { Module } from '@nestjs/common';
import { ResumeCompletionService } from './resume-completion.service';

@Module({
  providers: [ResumeCompletionService],
  exports: [ResumeCompletionService],
})
export class ResumeCompletionModule {}
