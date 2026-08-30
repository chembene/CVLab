import { UserRole } from '@prisma/client';
import { CareerAdvisorController } from './career-advisor.controller';
import type { CareerAdvisorService } from './career-advisor.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('CareerAdvisorController', () => {
  let service: jest.Mocked<CareerAdvisorService>;
  let controller: CareerAdvisorController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      requestAdvice: jest.fn(),
      list: jest.fn(),
      getOne: jest.fn(),
    } as unknown as jest.Mocked<CareerAdvisorService>;
    controller = new CareerAdvisorController(service);
  });

  it('requestAdvice() delegates to the service with the current user as both requester and target', async () => {
    service.requestAdvice.mockResolvedValue({ id: 'ca-1' } as never);
    const dto = { question: 'What should I focus on next?' } as never;

    const result = await controller.requestAdvice(user, dto);

    expect(service.requestAdvice).toHaveBeenCalledWith(user, 'user-1', dto);
    expect(result).toEqual({ id: 'ca-1' });
  });

  it('list() delegates to the service for the current user', async () => {
    service.list.mockResolvedValue([]);
    await controller.list(user);
    expect(service.list).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'ca-1' } as never);
    await controller.getOne(user, 'ca-1');
    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'ca-1');
  });
});
