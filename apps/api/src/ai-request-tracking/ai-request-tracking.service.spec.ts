import { NotFoundException } from '@nestjs/common';
import { AiRequestTrackingService } from './ai-request-tracking.service';
import type { AiRequestTrackingRepository } from './ai-request-tracking.repository';

describe('AiRequestTrackingService', () => {
  let repository: jest.Mocked<AiRequestTrackingRepository>;
  let service: AiRequestTrackingService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findById: jest.fn(),
      findByIdempotencyKey: jest.fn(),
      update: jest.fn(),
    } as unknown as jest.Mocked<AiRequestTrackingRepository>;
    service = new AiRequestTrackingService(repository);
  });

  describe('start', () => {
    it('creates a new PENDING row when the idempotency key is unused', async () => {
      repository.findByIdempotencyKey.mockResolvedValue(null);
      repository.create.mockResolvedValue({ id: 'req-1' } as never);

      const result = await service.start('user-1', {
        feature: 'cv_improvement',
        idempotencyKey: 'k1',
      });

      expect(repository.create).toHaveBeenCalledWith('user-1', {
        feature: 'cv_improvement',
        idempotencyKey: 'k1',
      });
      expect(result).toEqual({ id: 'req-1' });
    });

    it('returns the existing row instead of creating a duplicate when the idempotency key is already used', async () => {
      repository.findByIdempotencyKey.mockResolvedValue({ id: 'req-existing' } as never);

      const result = await service.start('user-1', {
        feature: 'cv_improvement',
        idempotencyKey: 'k1',
      });

      expect(repository.create).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'req-existing' });
    });
  });

  describe('complete', () => {
    it('marks the request SUCCEEDED with a completedAt timestamp', async () => {
      repository.findById.mockResolvedValue({ id: 'req-1' } as never);
      repository.update.mockResolvedValue({ id: 'req-1', status: 'SUCCEEDED' } as never);

      await service.complete('req-1', { totalTokens: 500, creditsCharged: 30 });

      const call = repository.update.mock.calls[0]!;
      expect(call[0]).toBe('req-1');
      expect(call[1].status).toBe('SUCCEEDED');
      expect(call[1].totalTokens).toBe(500);
      expect(call[1].completedAt).toBeInstanceOf(Date);
    });

    it('throws NotFound for an unknown request id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.complete('missing', {})).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('fail', () => {
    it('marks the request FAILED with a completedAt timestamp', async () => {
      repository.findById.mockResolvedValue({ id: 'req-1' } as never);
      repository.update.mockResolvedValue({ id: 'req-1', status: 'FAILED' } as never);

      await service.fail('req-1', { errorCode: 'PROVIDER_TIMEOUT' });

      const call = repository.update.mock.calls[0]!;
      expect(call[1].status).toBe('FAILED');
      expect(call[1].errorCode).toBe('PROVIDER_TIMEOUT');
      expect(call[1].completedAt).toBeInstanceOf(Date);
    });
  });

  describe('recordRefund', () => {
    it('increments creditsRefunded on top of any existing value', async () => {
      repository.findById.mockResolvedValue({ id: 'req-1', creditsRefunded: 10 } as never);
      repository.update.mockResolvedValue({ id: 'req-1', creditsRefunded: 40 } as never);

      await service.recordRefund('req-1', 30);

      expect(repository.update).toHaveBeenCalledWith('req-1', { creditsRefunded: 40 });
    });

    it('throws NotFound for an unknown request id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.recordRefund('missing', 10)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
