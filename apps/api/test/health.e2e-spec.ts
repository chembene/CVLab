import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { bootstrapTestApp } from './utils/bootstrap-test-app';

/**
 * Proves the whole bootstrap wiring works end-to-end: module graph resolves,
 * versioned routing works, the response envelope interceptor runs, and the
 * health endpoint reaches the real Prisma/Redis connections configured via
 * DATABASE_URL / REDIS_URL (see docker-compose.yml for local services).
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = await bootstrapTestApp(moduleRef);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns the success envelope with a status field', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(['ok', 'degraded']).toContain(response.body.data.status);
    expect(response.body.data.checks).toHaveProperty('database');
    expect(response.body.data.checks).toHaveProperty('redis');
  });
});
