import { TestsController } from './tests.controller';
import type { TestsService } from './tests.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';
import { UserRole } from '@prisma/client';

describe('TestsController', () => {
  let service: jest.Mocked<TestsService>;
  let controller: TestsController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      listAvailable: jest.fn(),
      getTest: jest.fn(),
      startSession: jest.fn(),
    } as unknown as jest.Mocked<TestsService>;
    controller = new TestsController(service);
  });

  it('list() delegates to the service, passing an optional category filter', async () => {
    service.listAvailable.mockResolvedValue([]);
    await controller.list('SQL');
    expect(service.listAvailable).toHaveBeenCalledWith('SQL');
  });

  it('list() works with no category filter', async () => {
    service.listAvailable.mockResolvedValue([]);
    await controller.list();
    expect(service.listAvailable).toHaveBeenCalledWith(undefined);
  });

  it('getOne() delegates with the requested id', async () => {
    service.getTest.mockResolvedValue({ id: 'test-1' } as never);
    await controller.getOne('test-1');
    expect(service.getTest).toHaveBeenCalledWith('test-1');
  });

  it('start() delegates to the service with the current user as both requester and target', async () => {
    service.startSession.mockResolvedValue({ id: 'session-1' } as never);
    const result = await controller.start(user, 'test-1');
    expect(service.startSession).toHaveBeenCalledWith(user, 'user-1', 'test-1');
    expect(result).toEqual({ id: 'session-1' });
  });
});
