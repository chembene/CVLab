import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  it('returns the status object produced by HealthService', async () => {
    const mockHealthService = {
      check: jest.fn().mockResolvedValue({
        status: 'ok',
        uptimeSeconds: 1,
        timestamp: new Date().toISOString(),
        checks: { database: 'up', redis: 'up' },
      }),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(mockHealthService.check).toHaveBeenCalledTimes(1);
  });
});
