import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from '../common/logger/app-logger.service';

/**
 * Clean connection abstraction for Redis. Phase 0 only proves connectivity
 * (used by the health check) — no business caching is implemented here yet,
 * per the Phase 0 scope.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new AppLogger(RedisService.name);
  private client!: Redis;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const url = this.configService.get<string>('REDIS_URL');
    this.client = new Redis(url as string, { maxRetriesPerRequest: 2 });
    this.client.on('error', (err) => this.logger.error(`Redis connection error: ${err.message}`));
    this.client.on('connect', () => this.logger.log('Connected to Redis'));
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit();
  }

  getClient(): Redis {
    return this.client;
  }

  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
