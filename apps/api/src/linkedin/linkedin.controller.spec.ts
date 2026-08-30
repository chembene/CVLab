import { UserRole } from '@prisma/client';
import { LinkedInController } from './linkedin.controller';
import type { LinkedInService } from './linkedin.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('LinkedInController', () => {
  let service: jest.Mocked<LinkedInService>;
  let controller: LinkedInController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      generateProfile: jest.fn(),
      list: jest.fn(),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<LinkedInService>;
    controller = new LinkedInController(service);
  });

  it('generateProfile() delegates to the service with the current user as both requester and target', async () => {
    service.generateProfile.mockResolvedValue({ id: 'lp-1' } as never);
    const dto = { targetRole: 'Staff Engineer' } as never;

    const result = await controller.generateProfile(user, dto);

    expect(service.generateProfile).toHaveBeenCalledWith(user, 'user-1', dto);
    expect(result).toEqual({ id: 'lp-1' });
  });

  it('list() delegates to the service for the current user', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'lp-1' } as never);
    await controller.getOne(user, 'lp-1');
    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'lp-1');
  });
});
