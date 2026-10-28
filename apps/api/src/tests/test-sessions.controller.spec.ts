import { UserRole } from '@prisma/client';
import { TestSessionsController } from './test-sessions.controller';
import type { TestsService } from './tests.service';
import type { RequestUser } from '../auth/interfaces/request-with-user.interface';

describe('TestSessionsController', () => {
  let service: jest.Mocked<TestsService>;
  let controller: TestSessionsController;

  const user: RequestUser = { id: 'user-1', role: UserRole.USER };

  beforeEach(() => {
    service = {
      listSessions: jest.fn(),
      getOne: jest.fn(),
      getResult: jest.fn(),
      submitAnswer: jest.fn(),
      completeSession: jest.fn(),
    } as unknown as jest.Mocked<TestsService>;
    controller = new TestSessionsController(service);
  });

  it('list() delegates to the service for the current user', async () => {
    service.listSessions.mockResolvedValue([]);
    await controller.list(user);
    expect(service.listSessions).toHaveBeenCalledWith(user, 'user-1');
  });

  it('getOne() delegates with the requested id', async () => {
    service.getOne.mockResolvedValue({ id: 'session-1' } as never);
    await controller.getOne(user, 'session-1');
    expect(service.getOne).toHaveBeenCalledWith(user, 'user-1', 'session-1');
  });

  it('getResult() delegates with the requested id', async () => {
    service.getResult.mockResolvedValue({ id: 'session-1' } as never);
    await controller.getResult(user, 'session-1');
    expect(service.getResult).toHaveBeenCalledWith(user, 'user-1', 'session-1');
  });

  it('submitAnswer() delegates with the requested id and body', async () => {
    const dto = { questionId: 'q1', selectedAnswer: 'SELECT' };
    service.submitAnswer.mockResolvedValue({} as never);
    await controller.submitAnswer(user, 'session-1', dto);
    expect(service.submitAnswer).toHaveBeenCalledWith(user, 'user-1', 'session-1', dto);
  });

  it('complete() delegates with the requested id', async () => {
    service.completeSession.mockResolvedValue({} as never);
    await controller.complete(user, 'session-1');
    expect(service.completeSession).toHaveBeenCalledWith(user, 'user-1', 'session-1');
  });
});
