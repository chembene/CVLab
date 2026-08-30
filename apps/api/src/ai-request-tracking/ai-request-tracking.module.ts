import { Module } from '@nestjs/common';
import { AiRequestTrackingRepository } from './ai-request-tracking.repository';
import { AiRequestTrackingService } from './ai-request-tracking.service';

/** No controller — this module has no HTTP surface of its own. Exported for AiOrchestrationModule (Phase 6) to inject. */
@Module({
  providers: [AiRequestTrackingRepository, AiRequestTrackingService],
  exports: [AiRequestTrackingService],
})
export class AiRequestTrackingModule {}
