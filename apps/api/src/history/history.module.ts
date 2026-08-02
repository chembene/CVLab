import { Module } from '@nestjs/common';
import { HistoryRepository } from './history.repository';
import { HistoryListener } from './history.listener';

@Module({
  providers: [HistoryRepository, HistoryListener],
  exports: [HistoryRepository],
})
export class HistoryModule {}
