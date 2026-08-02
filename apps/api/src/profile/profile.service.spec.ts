import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ProfileService } from './profile.service';
import type { ProfileRepository } from './profile.repository';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('ProfileService', () => {
  let repository: jest.Mocked<ProfileRepository>;
  let eventEmitter: { emit: jest.Mock };
  let completionService: { recalculate: jest.Mock };
  let service: ProfileService;

  const owner: RequestUser = { id: 'user-1', role: UserRole.USER };
  const stranger: RequestUser = { id: 'user-2', role: UserRole.USER };
  const admin: RequestUser = { id: 'admin-1', role: UserRole.ADMIN };

  beforeEach(() => {
    repository = {
      findByUserId: jest.fn(),
      upsert: jest.fn(),
    } as unknown as jest.Mocked<ProfileRepository>;
    eventEmitter = { emit: jest.fn() };
    completionService = { recalculate: jest.fn() };
    service = new ProfileService(repository, eventEmitter as any, completionService as any);
  });

  describe('getForUser', () => {
    it('allows the owner to read their own profile', async () => {
      repository.findByUserId.mockResolvedValue(null);
      await expect(service.getForUser(owner, 'user-1')).resolves.toBeNull();
    });

    it('allows an admin to read another user’s profile', async () => {
      repository.findByUserId.mockResolvedValue(null);
      await expect(service.getForUser(admin, 'user-1')).resolves.toBeNull();
    });

    it('denies a non-owner, non-admin user', async () => {
      await expect(service.getForUser(stranger, 'user-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('upsertForUser', () => {
    it('denies a non-owner, non-admin user', async () => {
      await expect(service.upsertForUser(stranger, 'user-1', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.upsert).not.toHaveBeenCalled();
    });

    it('emits a "created" event on first save and triggers completion recalculation', async () => {
      repository.findByUserId.mockResolvedValue(null);
      repository.upsert.mockResolvedValue({ id: 'profile-1' } as any);

      await service.upsertForUser(owner, 'user-1', { firstName: 'Jane' });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'created', entityType: 'profile' }),
      );
      expect(completionService.recalculate).toHaveBeenCalledWith('user-1');
    });

    it('emits an "updated" event when a profile already existed', async () => {
      repository.findByUserId.mockResolvedValue({ id: 'profile-1' } as any);
      repository.upsert.mockResolvedValue({ id: 'profile-1' } as any);

      await service.upsertForUser(owner, 'user-1', { firstName: 'Jane' });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'resume.entity.changed',
        expect.objectContaining({ action: 'updated' }),
      );
    });

    it('converts an ISO birthDate string to a Date before persisting', async () => {
      repository.findByUserId.mockResolvedValue(null);
      repository.upsert.mockResolvedValue({ id: 'profile-1' } as any);

      await service.upsertForUser(owner, 'user-1', { birthDate: '1990-05-20' });

      const [, data] = repository.upsert.mock.calls[0] as [string, { birthDate?: Date }];
      expect(data.birthDate).toBeInstanceOf(Date);
    });
  });
});
